import { Router, Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Conversation, Message } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { asyncHandler, qs, escapeRegex, uniq } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertMembers } from '../services/tenantChecks';
import { toUser, toWorkspace, isOnline } from '../services/realtime';
import { notify } from '../services/notify';
import { ensureWorkspaceConversation } from './workspaces';
import { can } from '../config/permissions';

const router = Router();
router.use(authenticate, tenant);

const accessible = (req: Request) => ({
  workspace: req.tenant!.workspaceId,
  $or: [{ type: 'workspace' }, { members: req.user!.id }],
});

async function getConv(req: Request, id: string) {
  const c = await Conversation.findOne({ _id: id, ...accessible(req) });
  if (!c) throw ApiError.notFound('Conversation not found');
  return c;
}

function deliver(conv: any, event: string, payload: any) {
  if (conv.type === 'workspace') toWorkspace(String(conv.workspace), event, payload);
  else for (const m of conv.members) toUser(String(m), event, payload);
}

router.get('/conversations', requirePermission('chat:read'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  await ensureWorkspaceConversation(ws, req.user!.id);
  const convs = await Conversation.find(accessible(req)).sort({ lastMessageAt: -1 }).populate('members', 'name avatar email');
  const unread = await Message.aggregate([
    { $match: { workspace: new Types.ObjectId(ws), conversation: { $in: convs.map((c) => c._id) }, sender: { $ne: new Types.ObjectId(req.user!.id) }, readBy: { $ne: new Types.ObjectId(req.user!.id) }, deleted: false } },
    { $group: { _id: '$conversation', n: { $sum: 1 } } },
  ]);
  const map = new Map(unread.map((u) => [String(u._id), u.n]));
  res.json({ data: convs.map((c) => ({ ...c.toObject(), unread: map.get(String(c._id)) || 0 })) });
}));

router.post('/conversations', requirePermission('chat:create'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId, me = req.user!.id;
  const body = z.object({
    type: z.enum(['dm', 'team']),
    userId: z.string().optional(),
    name: z.string().trim().min(1).max(60).optional(),
    memberIds: z.array(z.string()).max(100).optional(),
  }).parse(req.body);

  let conv: any;
  if (body.type === 'dm') {
    if (!body.userId || body.userId === me) throw ApiError.badRequest('Choose someone to message');
    await assertMembers(ws, [body.userId]);
    const dmKey = [me, body.userId].sort().join(':');
    conv = await Conversation.findOne({ workspace: ws, dmKey });
    if (!conv) conv = await Conversation.create({ workspace: ws, type: 'dm', members: [me, body.userId], dmKey, createdBy: me });
  } else {
    if (!body.name) throw ApiError.badRequest('Give the team chat a name');
    const members = uniq([me, ...(body.memberIds || [])]);
    await assertMembers(ws, members);
    conv = await Conversation.create({ workspace: ws, type: 'team', name: body.name, members, createdBy: me });
  }
  conv = await conv.populate('members', 'name avatar email');
  deliver(conv, 'chat:conversation', { ...conv.toObject(), unread: 0 });
  res.status(201).json({ data: { ...conv.toObject(), unread: 0 } });
}));

router.get('/conversations/:id/messages', requirePermission('chat:read'), asyncHandler(async (req, res) => {
  const conv = await getConv(req, req.params.id);
  const before = qs(req.query.before);
  const limit = Math.min(100, parseInt(qs(req.query.limit) || '40', 10) || 40);
  const q: any = { workspace: req.tenant!.workspaceId, conversation: conv._id };
  if (before) q.createdAt = { $lt: new Date(before) };
  const msgs = await Message.find(q).sort({ createdAt: -1 }).limit(limit).populate('sender', 'name avatar');
  res.json({ data: msgs.reverse(), hasMore: msgs.length === limit });
}));

router.post('/conversations/:id/messages', requirePermission('chat:create'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId, me = req.user!.id;
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const conv = await getConv(req, req.params.id);
  const msg = await (await Message.create({ workspace: ws, conversation: conv._id, sender: me, body, readBy: [me] })).populate('sender', 'name avatar');
  conv.lastMessageAt = new Date();
  conv.lastMessagePreview = body.slice(0, 80);
  await conv.save();
  deliver(conv, 'chat:message', msg.toObject());

  if (conv.type !== 'workspace') {
    const offline = conv.members.filter((m) => String(m) !== me && !isOnline(ws, String(m)));
    if (offline.length) await notify({ workspace: ws, users: offline, actor: me, type: 'chat', title: `New message from ${(msg.sender as any).name}`, body: body.slice(0, 100), link: `/chat?c=${conv._id}` });
  }
  res.status(201).json({ data: msg });
}));

router.post('/conversations/:id/read', requirePermission('chat:read'), asyncHandler(async (req, res) => {
  const conv = await getConv(req, req.params.id);
  await Message.updateMany({ workspace: req.tenant!.workspaceId, conversation: conv._id, readBy: { $ne: req.user!.id } }, { $addToSet: { readBy: req.user!.id } });
  deliver(conv, 'chat:read', { conversationId: String(conv._id), userId: req.user!.id });
  res.json({ message: 'ok' });
}));

router.patch('/messages/:id', requirePermission('chat:create'), asyncHandler(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const msg = await Message.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId, sender: req.user!.id, deleted: false });
  if (!msg) throw ApiError.notFound('Message not found');
  msg.body = body; msg.editedAt = new Date();
  await msg.save();
  const conv = await getConv(req, String(msg.conversation));
  const out = await msg.populate('sender', 'name avatar');
  deliver(conv, 'chat:message-updated', out.toObject());
  res.json({ data: out });
}));

router.delete('/messages/:id', requirePermission('chat:create'), asyncHandler(async (req, res) => {
  const msg = await Message.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId });
  if (!msg) throw ApiError.notFound('Message not found');
  if (String(msg.sender) !== req.user!.id && !can(req.tenant!.role, 'chat:delete')) throw ApiError.forbidden('You can only delete your own messages');
  msg.deleted = true; msg.body = '';
  await msg.save();
  const conv = await getConv(req, String(msg.conversation));
  deliver(conv, 'chat:message-updated', (await msg.populate('sender', 'name avatar')).toObject());
  res.json({ message: 'Deleted' });
}));

router.get('/search', requirePermission('chat:read'), asyncHandler(async (req, res) => {
  const s = qs(req.query.q);
  if (!s || s.length < 2) return res.json({ data: [] });
  const convs = await Conversation.find(accessible(req)).select('_id name type');
  const data = await Message.find({ workspace: req.tenant!.workspaceId, conversation: { $in: convs.map((c) => c._id) }, deleted: false, body: { $regex: escapeRegex(s), $options: 'i' } })
    .sort({ createdAt: -1 }).limit(30).populate('sender', 'name avatar');
  res.json({ data });
}));

export default router;
