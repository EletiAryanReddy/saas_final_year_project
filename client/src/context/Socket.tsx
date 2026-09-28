'use client';
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '@/lib/socket';
import { refreshSession, api } from '@/lib/api';
import { useApp } from './App';
import { useToast } from './Toast';
import type { Notification } from '@/lib/types';

interface SocketCtx { socket: Socket | null; connected: boolean; error: string; online: Set<string>; unread: number; setUnread: (n: number | ((p: number) => number)) => void; }
const Ctx = createContext<SocketCtx>({ socket: null, connected: false, error: '', online: new Set(), unread: 0, setUnread: () => {} });
export const useSocket = () => useContext(Ctx);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, current, workspaces } = useApp();
  const toast = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [presence, setPresence] = useState<Record<string, string[]>>({});
  const [unread, setUnread] = useState(0);
  const currentId = useRef<string | undefined>(undefined);
  currentId.current = current?._id;

  useEffect(() => {
    if (!user) return;
    const s = createSocket();
    setSocket(s);
    s.on('connect', () => { setConnected(true); setError(''); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', async (err) => {
      console.error('[realtime] connection error:', err.message);
      setError(err.message === 'unauthorized' ? 'Not authorised - try signing out and in again' : `${err.message} (is the backend running at ${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000'}, and does its CLIENT_URL match ${typeof window !== 'undefined' ? window.location.origin : 'this page'}?)`);
      if (err.message === 'unauthorized' && (await refreshSession())) s.connect(); // token expired while offline
    });
    s.on('presence:list', (m: Record<string, string[]>) => setPresence(m));
    s.on('presence:update', ({ workspaceId, userId, online }: { workspaceId: string; userId: string; online: boolean }) =>
      setPresence((p) => {
        const set = new Set(p[workspaceId] || []);
        online ? set.add(userId) : set.delete(userId);
        return { ...p, [workspaceId]: [...set] };
      })
    );
    s.on('notification:new', (n: Notification & { workspace: string }) => {
      if (n.workspace !== currentId.current) return;
      setUnread((u) => u + 1);
      toast(n.title + (n.body ? ` - ${n.body}` : ''), 'info');
    });
    return () => { s.removeAllListeners(); s.disconnect(); setSocket(null); setConnected(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // join/leave workspace rooms when memberships change (new workspace, accepted invite, removed)
  const idKey = workspaces.map((w) => w.workspace._id).join(',');
  useEffect(() => { if (socket?.connected) socket.emit('workspace:sync'); }, [idKey, socket, connected]);

  useEffect(() => {
    if (!current) { setUnread(0); return; }
    api.get('/notifications?limit=1').then((r) => setUnread(r.unread || 0)).catch(() => {});
  }, [current?._id]);

  const online = new Set(presence[current?._id || ''] || []);
  return <Ctx.Provider value={{ socket, connected, error, online, unread, setUnread }}>{children}</Ctx.Provider>;
}

/** Subscribe to a realtime event; payloads from other workspaces are ignored. */
export function useLive<T = any>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const { current } = useApp();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (p: any) => {
      if (p && typeof p === 'object' && p.workspace && current && String(p.workspace) !== current._id) return;
      ref.current(p);
    };
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [socket, event, current?._id]);
}
