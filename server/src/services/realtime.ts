import type { Server } from 'socket.io';

let io: Server | null = null;
export const setIO = (s: Server) => { io = s; };
export const getIO = () => io;

export const toWorkspace = (workspaceId: string, event: string, payload: unknown) =>
  io?.to(`ws:${workspaceId}`).emit(event, payload);
export const toUser = (userId: string, event: string, payload: unknown) =>
  io?.to(`user:${userId}`).emit(event, payload);

// ---- presence: workspace -> user -> open socket count ----
const online = new Map<string, Map<string, number>>();

export function markOnline(workspaceId: string, userId: string) {
  const m = online.get(workspaceId) ?? new Map<string, number>();
  const first = !m.has(userId);
  m.set(userId, (m.get(userId) || 0) + 1);
  online.set(workspaceId, m);
  return first;
}
export function markOffline(workspaceId: string, userId: string) {
  const m = online.get(workspaceId);
  if (!m) return false;
  const n = (m.get(userId) || 1) - 1;
  if (n <= 0) { m.delete(userId); return true; }
  m.set(userId, n);
  return false;
}
export const onlineUsers = (workspaceId: string) => [...(online.get(workspaceId)?.keys() ?? [])];
export const isOnline = (workspaceId: string, userId: string) => !!online.get(workspaceId)?.has(userId);
