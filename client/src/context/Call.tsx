'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from '@/lib/api';
import { useApp } from './App';
import { useSocket } from './Socket';
import { useToast } from './Toast';
import { CallOverlay } from '@/components/CallOverlay';

export interface Peer { socketId: string; userId: string; name: string; avatar?: string; stream?: MediaStream; audio: boolean; video: boolean; screen: boolean; state: string }
export interface Incoming { roomId: string; workspaceId: string; type: 'audio' | 'video'; mode: string; from: { id: string; name: string; avatar?: string }; count: number }
interface CallState { roomId: string; type: 'audio' | 'video'; title?: string; phase: 'ringing' | 'connected'; isHost: boolean; meeting: boolean; mode: 'direct' | 'group' }

interface CallCtx {
  call: CallState | null; incoming: Incoming | null; peers: Peer[]; localStream: MediaStream | null;
  muted: boolean; cameraOff: boolean; sharing: boolean; canShare: boolean;
  startCall: (userIds: string[], type: 'audio' | 'video') => Promise<void>;
  joinMeeting: (roomId: string, title?: string, isHost?: boolean) => Promise<void>;
  accept: () => Promise<void>; reject: () => void; leave: () => void; endForAll: () => void;
  toggleMic: () => void; toggleCam: () => void; toggleScreen: () => Promise<void>;
}
const Ctx = createContext<CallCtx>(null as any);
export const useCall = () => useContext(Ctx);

type Signal = { roomId: string; from: string; userId: string; data: any };

export function CallProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const { current } = useApp();
  const toast = useToast();

  const [call, setCall] = useState<CallState | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);

  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pending = useRef(new Map<string, RTCIceCandidateInit[]>());
  const local = useRef<MediaStream | null>(null);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const roomRef = useRef<string | null>(null);
  const iceRef = useRef<RTCConfiguration>({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const callRef = useRef<CallState | null>(null);
  const mediaRef = useRef({ audio: true, video: true, screen: false });
  callRef.current = call;

  const patchPeer = useCallback((id: string, p: Partial<Peer>) => setPeers((s) => s.map((x) => (x.socketId === id ? { ...x, ...p } : x))), []);

  const cleanup = useCallback(() => {
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear(); pending.current.clear();
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null; cameraTrack.current = null; roomRef.current = null;
    setLocalStream(null); setPeers([]); setCall(null); setMuted(false); setCameraOff(false); setSharing(false);
  }, []);

  async function getMedia(type: 'audio' | 'video') {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Calls need HTTPS (or localhost) and a supported browser.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
    } catch (e: any) {
      if (type === 'video') { // fall back to audio only if the camera is unavailable or denied
        toast('Camera unavailable - joining with audio only', 'info');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else throw new Error(e?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'No microphone found.');
    }
    local.current = stream; cameraTrack.current = stream.getVideoTracks()[0] || null;
    setLocalStream(stream);
    return stream;
  }

  async function loadIce() {
    try { const r = await api.get('/calls/ice-servers'); iceRef.current = { iceServers: r.data.iceServers }; } catch { /* keep default STUN */ }
  }

  const createPc = useCallback((peer: { socketId: string; userId: string; name: string; avatar?: string }) => {
    const existing = pcs.current.get(peer.socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(iceRef.current);
    pcs.current.set(peer.socketId, pc);
    local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
    // audio calls still reserve a video m-line so a camera or screen can be added without renegotiation
    if (!local.current?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv' });
    pc.onicecandidate = (e) => { if (e.candidate && roomRef.current) socket?.emit('webrtc:signal', { roomId: roomRef.current, to: peer.socketId, data: { candidate: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => { const [stream] = e.streams; if (stream) patchPeer(peer.socketId, { stream }); };
    pc.onconnectionstatechange = () => {
      patchPeer(peer.socketId, { state: pc.connectionState });
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    setPeers((s) => (s.some((x) => x.socketId === peer.socketId) ? s : [...s, { ...peer, audio: true, video: callRef.current?.type === 'video', screen: false, state: 'connecting' }]));
    return pc;
  }, [socket, patchPeer]);

  const sendOffer = useCallback(async (peer: { socketId: string; userId: string; name: string; avatar?: string }) => {
    const pc = createPc(peer);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket?.emit('webrtc:signal', { roomId: roomRef.current, to: peer.socketId, data: { sdp: pc.localDescription } });
  }, [createPc, socket]);

  // ---- socket events ----
  useEffect(() => {
    if (!socket) return;
    const onIncoming = (i: Incoming) => { if (callRef.current) { socket.emit('call:reject', { roomId: i.roomId }); return; } setIncoming(i); };
    const onDismiss = ({ roomId }: { roomId: string }) => setIncoming((x) => (x?.roomId === roomId ? null : x));
    const onPeerJoined = ({ peer }: any) => {
      setPeers((s) => (s.some((x) => x.socketId === peer.socketId) ? s : [...s, { ...peer, audio: true, video: callRef.current?.type === 'video', screen: false, state: 'waiting' }]));
      if (roomRef.current) socket.emit('call:media', { roomId: roomRef.current, ...mediaRef.current }); // tell the newcomer my mic/camera state
    };
    const onPeerLeft = ({ socketId }: any) => {
      pcs.current.get(socketId)?.close(); pcs.current.delete(socketId);
      setPeers((s) => s.filter((x) => x.socketId !== socketId));
    };
    const onSignal = async ({ roomId, from, userId, data }: Signal) => {
      if (roomId !== roomRef.current) return;
      try {
        if (data.sdp) {
          const known = peersRef.current.find((p) => p.socketId === from);
          const pc = createPc({ socketId: from, userId, name: known?.name || 'Guest', avatar: known?.avatar });
          await pc.setRemoteDescription(data.sdp);
          for (const c of pending.current.get(from) || []) await pc.addIceCandidate(c).catch(() => {});
          pending.current.delete(from);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc:signal', { roomId, to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          const pc = pcs.current.get(from);
          if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pending.current.set(from, [...(pending.current.get(from) || []), data.candidate]);
        }
      } catch (e) { console.error('[webrtc] signal error', e); }
    };
    const onMedia = ({ socketId, audio, video, screen }: any) => patchPeer(socketId, { audio, video, screen });
    const onRejected = ({ name }: any) => { toast(`${name} declined the call`, 'info'); if (callRef.current?.phase === 'ringing' && callRef.current.mode === 'direct') cleanup(); };
    const onMissed = () => { toast('No answer', 'info'); cleanup(); };
    const onEnded = ({ by }: any) => { toast(`${by} ended the call`, 'info'); cleanup(); };

    socket.on('call:incoming', onIncoming); socket.on('call:dismiss', onDismiss); socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft); socket.on('webrtc:signal', onSignal); socket.on('call:media', onMedia);
    socket.on('call:rejected', onRejected); socket.on('call:missed', onMissed); socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming); socket.off('call:dismiss', onDismiss); socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft); socket.off('webrtc:signal', onSignal); socket.off('call:media', onMedia);
      socket.off('call:rejected', onRejected); socket.off('call:missed', onMissed); socket.off('call:ended', onEnded);
    };
  }, [socket, createPc, patchPeer, cleanup, toast]);

  const peersRef = useRef<Peer[]>([]);
  peersRef.current = peers;

  // a call promoted from "ringing" to "connected" as soon as someone is in the room
  useEffect(() => { if (call?.phase === 'ringing' && peers.length) setCall((c) => c && { ...c, phase: 'connected' }); }, [peers.length, call?.phase]);
  useEffect(() => cleanup, [cleanup]);
  useEffect(() => { if (callRef.current) { if (roomRef.current) socket?.emit('call:leave', { roomId: roomRef.current }); cleanup(); } /* workspace switched mid-call */ }, [current?._id]); // eslint-disable-line

  const emitAck = <T,>(ev: string, payload: any) => new Promise<T>((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected to the realtime server. Try again in a moment.'));
    socket.timeout(15000).emit(ev, payload, (err: any, res: any) => (err ? reject(new Error('The server took too long to respond.')) : res?.ok ? resolve(res) : reject(new Error(res?.error || 'Request failed'))));
  });

  const startCall = useCallback(async (userIds: string[], type: 'audio' | 'video') => {
    if (callRef.current) return toast('You are already in a call', 'info');
    try {
      await loadIce(); await getMedia(type);
      const res = await emitAck<{ roomId: string }>('call:invite', { workspaceId: current!._id, userIds, type });
      roomRef.current = res.roomId;
      setCall({ roomId: res.roomId, type, phase: 'ringing', isHost: true, meeting: false, mode: userIds.length > 1 ? 'group' : 'direct' });
      announceMedia();
    } catch (e) { cleanup(); toast((e as Error).message, 'error'); }
  }, [socket, current?._id]); // eslint-disable-line

  const accept = useCallback(async () => {
    const inc = incoming; if (!inc) return;
    setIncoming(null);
    try {
      await loadIce(); await getMedia(inc.type);
      const res = await emitAck<{ peers: any[]; type: 'audio' | 'video' }>('call:accept', { roomId: inc.roomId });
      roomRef.current = inc.roomId;
      setCall({ roomId: inc.roomId, type: inc.type, phase: 'connected', isHost: false, meeting: false, mode: inc.mode as any });
      announceMedia();
      for (const p of res.peers) await sendOffer(p);
    } catch (e) { cleanup(); toast((e as Error).message, 'error'); }
  }, [incoming, sendOffer]); // eslint-disable-line

  const reject = useCallback(() => { if (incoming) socket?.emit('call:reject', { roomId: incoming.roomId }); setIncoming(null); }, [incoming, socket]);

  const joinMeeting = useCallback(async (roomId: string, title?: string, isHost = false) => {
    if (callRef.current) return toast('You are already in a call', 'info');
    try {
      await loadIce(); await getMedia('video');
      const res = await emitAck<{ peers: any[]; title?: string }>('call:join-meeting', { roomId });
      roomRef.current = roomId;
      setCall({ roomId, type: 'video', title: res.title || title, phase: 'connected', isHost, meeting: true, mode: 'group' });
      announceMedia();
      for (const p of res.peers) await sendOffer(p);
    } catch (e) { cleanup(); toast((e as Error).message, 'error'); }
  }, [socket, sendOffer]); // eslint-disable-line

  const leave = useCallback(() => { if (roomRef.current) socket?.emit('call:leave', { roomId: roomRef.current }); cleanup(); }, [socket, cleanup]);
  const endForAll = useCallback(() => { if (roomRef.current) socket?.emit('call:end', { roomId: roomRef.current }); cleanup(); }, [socket, cleanup]);

  const broadcastMedia = (audio: boolean, video: boolean, screen: boolean) => {
    mediaRef.current = { audio, video, screen };
    if (roomRef.current) socket?.emit('call:media', { roomId: roomRef.current, audio, video, screen });
  };
  const announceMedia = () => broadcastMedia(true, !!cameraTrack.current, false);

  const toggleMic = useCallback(() => {
    const t = local.current?.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; setMuted(!t.enabled);
    broadcastMedia(t.enabled, !cameraOff, sharing);
  }, [cameraOff, sharing]); // eslint-disable-line

  const toggleCam = useCallback(() => {
    const t = cameraTrack.current; if (!t) return toast('No camera in this call', 'info');
    t.enabled = !t.enabled; setCameraOff(!t.enabled);
    broadcastMedia(!muted, t.enabled, sharing);
  }, [muted, sharing]); // eslint-disable-line

  const setOutgoingVideo = async (track: MediaStreamTrack | null) => {
    for (const pc of pcs.current.values()) {
      const sender = pc.getTransceivers().find((t) => t.sender.track?.kind === 'video' || t.receiver.track.kind === 'video')?.sender;
      await sender?.replaceTrack(track).catch(() => {});
    }
  };

  const toggleScreen = useCallback(async () => {
    if (sharing) {
      await setOutgoingVideo(cameraTrack.current);
      screenStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current = null;
      if (local.current && cameraTrack.current) setLocalStream(new MediaStream([...local.current.getAudioTracks(), cameraTrack.current]));
      setSharing(false); broadcastMedia(!muted, !cameraOff, false);
      return;
    }
    try {
      const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      screenStream.current = s;
      const track = s.getVideoTracks()[0];
      track.onended = () => { toggleScreenRef.current?.(); };
      await setOutgoingVideo(track);
      if (local.current) setLocalStream(new MediaStream([...local.current.getAudioTracks(), track]));
      setSharing(true); broadcastMedia(!muted, !cameraOff, true);
    } catch { /* user cancelled the picker */ }
  }, [sharing, muted, cameraOff]); // eslint-disable-line
  const screenStream = useRef<MediaStream | null>(null);
  const toggleScreenRef = useRef<() => Promise<void>>();
  toggleScreenRef.current = toggleScreen;

  const canShare = typeof navigator !== 'undefined' && !!(navigator.mediaDevices as any)?.getDisplayMedia;

  return (
    <Ctx.Provider value={{ call, incoming, peers, localStream, muted, cameraOff, sharing, canShare, startCall, joinMeeting, accept, reject, leave, endForAll, toggleMic, toggleCam, toggleScreen }}>
      {children}
      <CallOverlay />
    </Ctx.Provider>
  );
}
