import http from 'http';
import crypto from 'crypto';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccess } from '../utils/tokens';
import { Membership, User, Call, Meeting, Whiteboard, Conversation } from '../models';
import { can, Role } from '../config/permissions';
import { setIO, markOnline, markOffline, onlineUsers, toUser } from '../services/realtime';
import { notify } from '../services/notify';

const room = (id: string) => `call:${id}`;
const MAX = env.webrtc.maxMeshPeers;
const ELEMENT_TYPES = new Set(['pen', 'line', 'rect', 'ellipse', 'text']);

export function initSockets(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: env.clientUrl.split(',').map((s) => s.trim()), credentials: true },
    maxHttpBufferSize: 1e6,
  });
  setIO(io);

  // ---------- auth ----------
  io.use(async (socket, next) => {
    try {
      const { sub } = verifyAccess(String(socket.handshake.auth?.token || ''));
      const user = await User.findById(sub).select('name avatar');
      if (!user) return next(new Error('unauthorized'));
      const ms = await Membership.find({ user: sub }).select('workspace role');
      socket.data.userId = sub;
      socket.data.name = user.name;
      socket.data.avatar = user.avatar;
      socket.data.roles = Object.fromEntries(ms.map((m) => [String(m.workspace), m.role]));
      socket.data.workspaces = new Set<string>();
      socket.data.boards = {};
      next();
    } catch { next(new Error('unauthorized')); }
  });

  const peersIn = async (roomId: string, exceptId?: string) =>
    (await io.in(room(roomId)).fetchSockets())
      .filter((s) => s.id !== exceptId)
      .map((s) => ({ socketId: s.id, userId: s.data.userId as string, name: s.data.name as string, avatar: s.data.avatar as string | undefined }));

  async function finalizeCall(roomId: string) {
    const call = await Call.findOne({ roomId });
    if (!call) return;
    const invitees = call.invited.map(String);
    if (call.status === 'ringing') {
      call.status = 'missed';
      invitees.forEach((id) => toUser(id, 'call:dismiss', { roomId }));
      const initiator = await User.findById(call.initiator).select('name');
      await notify({ workspace: String(call.workspace), users: invitees, actor: String(call.initiator), type: 'call', title: `Missed ${call.type} call from ${initiator?.name || 'a teammate'}`, link: '/calls' });
    } else if (call.status === 'answered') {
      call.status = 'ended';
    }
    call.endedAt = new Date();
    call.durationSec = call.status === 'ended' ? Math.round((+call.endedAt - +call.startedAt) / 1000) : 0;
    await call.save();
  }

  async function leaveCall(socket: Socket, roomId: string) {
    if (!socket.rooms.has(room(roomId))) return;
    socket.leave(room(roomId));
    socket.to(room(roomId)).emit('call:peer-left', { roomId, socketId: socket.id, userId: socket.data.userId });
    await Call.updateOne({ roomId, 'participants.user': socket.data.userId, 'participants.leftAt': null }, { $set: { 'participants.$.leftAt': new Date() } }).catch(() => {});
    const remaining = await io.in(room(roomId)).fetchSockets();
    if (!remaining.length) await finalizeCall(roomId);
  }

  const syncWorkspaces = async (socket: Socket) => {
    const ms = await Membership.find({ user: socket.data.userId }).select('workspace role');
    const next = Object.fromEntries(ms.map((m) => [String(m.workspace), m.role as Role]));
    const joined: Set<string> = socket.data.workspaces;
    for (const ws of Object.keys(next)) {
      if (joined.has(ws)) continue;
      joined.add(ws);
      socket.join(`ws:${ws}`);
      if (markOnline(ws, socket.data.userId)) io.to(`ws:${ws}`).emit('presence:update', { workspaceId: ws, userId: socket.data.userId, online: true });
    }
    for (const ws of [...joined]) {
      if (next[ws]) continue;
      joined.delete(ws);
      socket.leave(`ws:${ws}`);
      if (markOffline(ws, socket.data.userId)) io.to(`ws:${ws}`).emit('presence:update', { workspaceId: ws, userId: socket.data.userId, online: false });
    }
    socket.data.roles = next;
    socket.emit('presence:list', Object.fromEntries([...joined].map((ws) => [ws, onlineUsers(ws)])));
  };

  io.on('connection', (socket) => {
    const { userId, name, avatar } = socket.data;
    socket.join(`user:${userId}`);
    syncWorkspaces(socket).catch((e) => console.error('[socket] sync', e));

    socket.on('workspace:sync', () => { syncWorkspaces(socket).catch(() => {}); });

    // ---------- chat typing ----------
    socket.on('chat:join', async ({ conversationId }: { conversationId: string }, ack?: Function) => {
      try {
        const ws = Object.keys(socket.data.roles);
        const c = await Conversation.findOne({ _id: conversationId, workspace: { $in: ws }, $or: [{ type: 'workspace' }, { members: userId }] }).select('_id');
        if (!c) return ack?.({ ok: false });
        socket.join(`conv:${conversationId}`);
        ack?.({ ok: true });
      } catch { ack?.({ ok: false }); }
    });
    socket.on('chat:leave', ({ conversationId }: { conversationId: string }) => socket.leave(`conv:${conversationId}`));
    socket.on('chat:typing', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      if (socket.rooms.has(`conv:${conversationId}`)) socket.to(`conv:${conversationId}`).emit('chat:typing', { conversationId, userId, name, isTyping: !!isTyping });
    });

    // ---------- calls (WebRTC signalling, P2P mesh) ----------
    socket.on('call:invite', async (p: { workspaceId: string; type: 'audio' | 'video'; userIds: string[] }, ack?: Function) => {
      try {
        const role: Role | undefined = socket.data.roles[p.workspaceId];
        if (!role || !can(role, 'chat:create')) throw new Error('You cannot start calls in this workspace');
        const userIds = [...new Set(p.userIds || [])].filter((id) => id !== userId).slice(0, MAX - 1);
        if (!userIds.length) throw new Error('Choose someone to call');
        if ((await Membership.countDocuments({ workspace: p.workspaceId, user: { $in: userIds } })) !== userIds.length) throw new Error('Some people are not in this workspace');
        const type = p.type === 'video' ? 'video' : 'audio';
        const mode = userIds.length > 1 ? 'group' : 'direct';
        const roomId = crypto.randomUUID();
        await Call.create({ workspace: p.workspaceId, roomId, type, mode, initiator: userId, invited: userIds, participants: [{ user: userId, joinedAt: new Date() }], status: 'ringing' });
        socket.join(room(roomId));
        for (const id of userIds) toUser(id, 'call:incoming', { roomId, workspaceId: p.workspaceId, type, mode, from: { id: userId, name, avatar }, count: userIds.length + 1 });
        setTimeout(async () => {
          const c = await Call.findOne({ roomId }).select('status');
          if (c?.status === 'ringing') {
            io.to(room(roomId)).emit('call:missed', { roomId });
            await finalizeCall(roomId);
            io.in(room(roomId)).socketsLeave(room(roomId));
          }
        }, 45_000);
        ack?.({ ok: true, roomId });
      } catch (e: any) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('call:accept', async ({ roomId }: { roomId: string }, ack?: Function) => {
      try {
        const call = await Call.findOne({ roomId });
        if (!call || !['ringing', 'answered'].includes(call.status)) throw new Error('This call has already ended');
        const invited = call.invited.map(String).includes(userId) || String(call.initiator) === userId;
        if (!invited || !socket.data.roles[String(call.workspace)]) throw new Error('You were not invited to this call');
        const existing = await peersIn(roomId, socket.id);
        if (existing.length >= MAX) throw new Error(`This call is full (${MAX} people max in peer-to-peer mode)`);
        socket.join(room(roomId));
        call.status = 'answered';
        call.participants.push({ user: userId, joinedAt: new Date() } as any);
        await call.save();
        socket.to(room(roomId)).emit('call:peer-joined', { roomId, peer: { socketId: socket.id, userId, name, avatar } });
        socket.to(`user:${userId}`).emit('call:dismiss', { roomId }); // stop ringing on my other tabs
        ack?.({ ok: true, peers: existing, type: call.type });
      } catch (e: any) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('call:reject', async ({ roomId }: { roomId: string }) => {
      const call = await Call.findOne({ roomId });
      if (!call || !call.invited.map(String).includes(userId)) return;
      socket.to(`user:${userId}`).emit('call:dismiss', { roomId });
      io.to(room(roomId)).emit('call:rejected', { roomId, userId, name });
      if (call.mode === 'direct' && call.status === 'ringing') {
        call.status = 'rejected'; call.endedAt = new Date();
        await call.save();
        io.in(room(roomId)).socketsLeave(room(roomId));
      }
    });

    socket.on('call:join-meeting', async ({ roomId }: { roomId: string }, ack?: Function) => {
      try {
        const meeting = await Meeting.findOne({ roomId });
        const ws = meeting && String(meeting.workspace);
        const role: Role | undefined = ws ? socket.data.roles[ws] : undefined;
        if (!meeting || !role) throw new Error('Meeting not found');
        if (meeting.status === 'ended') throw new Error('This meeting has ended');
        const allowed = meeting.participants.map(String).includes(userId) || String(meeting.host) === userId || role === 'owner' || role === 'admin';
        if (!allowed) throw new Error('You are not a participant of this meeting');
        const existing = await peersIn(roomId, socket.id);
        if (existing.length >= MAX) throw new Error(`This meeting is full (${MAX} people max in peer-to-peer mode)`);
        socket.join(room(roomId));
        if (meeting.status === 'scheduled') { meeting.status = 'live'; await meeting.save(); }
        await Call.updateOne(
          { roomId },
          { $setOnInsert: { workspace: meeting.workspace, type: 'video', mode: 'group', initiator: meeting.host, invited: meeting.participants, startedAt: new Date() }, $set: { status: 'answered' }, $unset: { endedAt: 1 }, $push: { participants: { user: userId, joinedAt: new Date() } } },
          { upsert: true }
        );
        socket.to(room(roomId)).emit('call:peer-joined', { roomId, peer: { socketId: socket.id, userId, name, avatar } });
        ack?.({ ok: true, peers: existing, type: 'video', title: meeting.title });
      } catch (e: any) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('webrtc:signal', ({ roomId, to, data }: { roomId: string; to: string; data: unknown }) => {
      if (!socket.rooms.has(room(roomId)) || !io.sockets.adapter.rooms.get(room(roomId))?.has(to)) return;
      io.to(to).emit('webrtc:signal', { roomId, from: socket.id, userId, data });
    });

    socket.on('call:media', ({ roomId, audio, video, screen }: { roomId: string; audio: boolean; video: boolean; screen: boolean }) => {
      if (socket.rooms.has(room(roomId))) socket.to(room(roomId)).emit('call:media', { roomId, socketId: socket.id, audio: !!audio, video: !!video, screen: !!screen });
    });

    socket.on('call:leave', ({ roomId }: { roomId: string }) => { leaveCall(socket, roomId).catch(() => {}); });

    socket.on('call:end', async ({ roomId }: { roomId: string }) => {
      const call = await Call.findOne({ roomId });
      const meeting = call ? null : await Meeting.findOne({ roomId });
      const ws = String(call?.workspace || meeting?.workspace || '');
      const role: Role | undefined = socket.data.roles[ws];
      const allowed = role === 'owner' || role === 'admin' || String(call?.initiator) === userId || String(meeting?.host) === userId;
      if (!allowed || !socket.rooms.has(room(roomId))) return;
      io.to(room(roomId)).emit('call:ended', { roomId, by: name });
      io.in(room(roomId)).socketsLeave(room(roomId));
      await finalizeCall(roomId);
    });

    // ---------- whiteboard ----------
    socket.on('wb:join', async ({ boardId }: { boardId: string }, ack?: Function) => {
      try {
        const board = await Whiteboard.findOne({ _id: boardId, workspace: { $in: Object.keys(socket.data.roles) } }).select('workspace');
        if (!board) return ack?.({ ok: false, error: 'Board not found' });
        const ws = String(board.workspace);
        socket.data.boards[boardId] = ws;
        socket.join(`wb:${boardId}`);
        socket.to(`wb:${boardId}`).emit('wb:user', { socketId: socket.id, userId, name, joined: true });
        const others = (await io.in(`wb:${boardId}`).fetchSockets()).filter((s) => s.id !== socket.id).map((s) => ({ socketId: s.id, userId: s.data.userId, name: s.data.name }));
        ack?.({ ok: true, canDraw: can(socket.data.roles[ws], 'whiteboard:update'), users: others });
      } catch { ack?.({ ok: false, error: 'Could not open board' }); }
    });
    const writable = (boardId: string) => {
      const ws = socket.data.boards[boardId];
      return ws && socket.data.roles[ws] && can(socket.data.roles[ws], 'whiteboard:update') ? (ws as string) : null;
    };
    socket.on('wb:live', ({ boardId, element }: any) => { if (writable(boardId)) socket.volatile.to(`wb:${boardId}`).emit('wb:live', { from: socket.id, element }); });
    socket.on('wb:commit', async ({ boardId, element }: any) => {
      const ws = writable(boardId);
      if (!ws || !element || typeof element.id !== 'string' || !ELEMENT_TYPES.has(element.type) || JSON.stringify(element).length > 150_000) return;
      await Whiteboard.updateOne({ _id: boardId, workspace: ws }, { $push: { elements: { $each: [element], $slice: -5000 } } });
      socket.to(`wb:${boardId}`).emit('wb:commit', { from: socket.id, element });
    });
    socket.on('wb:remove', async ({ boardId, elementId }: any) => {
      const ws = writable(boardId);
      if (!ws || typeof elementId !== 'string') return;
      await Whiteboard.updateOne({ _id: boardId, workspace: ws }, { $pull: { elements: { id: elementId } } });
      socket.to(`wb:${boardId}`).emit('wb:remove', { elementId });
    });
    socket.on('wb:clear', async ({ boardId }: any) => {
      const ws = writable(boardId);
      if (!ws) return;
      await Whiteboard.updateOne({ _id: boardId, workspace: ws }, { $set: { elements: [] } });
      socket.to(`wb:${boardId}`).emit('wb:clear', {});
    });
    socket.on('wb:cursor', ({ boardId, x, y }: any) => {
      if (socket.rooms.has(`wb:${boardId}`)) socket.volatile.to(`wb:${boardId}`).emit('wb:cursor', { from: socket.id, name, x, y });
    });
    socket.on('wb:leave', ({ boardId }: any) => {
      socket.leave(`wb:${boardId}`);
      socket.to(`wb:${boardId}`).emit('wb:user', { socketId: socket.id, userId, name, joined: false });
    });

    // ---------- teardown ----------
    socket.on('disconnecting', () => {
      for (const r of [...socket.rooms]) {
        if (r.startsWith('call:')) leaveCall(socket, r.slice(5)).catch(() => {});
        if (r.startsWith('wb:')) socket.to(r).emit('wb:user', { socketId: socket.id, userId, name, joined: false });
      }
    });
    socket.on('disconnect', () => {
      for (const ws of socket.data.workspaces as Set<string>) {
        if (markOffline(ws, userId)) io.to(`ws:${ws}`).emit('presence:update', { workspaceId: ws, userId, online: false });
      }
      User.updateOne({ _id: userId }, { lastSeen: new Date() }).catch(() => {});
    });
  });

  return io;
}
