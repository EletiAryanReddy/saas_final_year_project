'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, refreshSession, setToken, setWorkspaceId, setAuthLostHandler } from '@/lib/api';
import type { User, MembershipRef, Workspace, Member, R } from '@/lib/types';

interface AppCtx {
  ready: boolean;
  user: User | null;
  workspaces: MembershipRef[];
  current: Workspace | null;
  members: Member[];
  can: (perm: string) => boolean;
  startSession: (s: { accessToken: string; user: User }) => Promise<void>;
  logout: () => Promise<void>;
  reload: (preferWorkspaceId?: string) => Promise<void>;
  reloadWorkspace: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  setUser: (u: User) => void;
}
const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

const WS_KEY = 'cs_workspace';

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<MembershipRef[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const loadWorkspace = useCallback(async (id: string | null) => {
    setWorkspaceId(id);
    if (!id) { setCurrent(null); setMembers([]); return; }
    try {
      const [w, m] = await Promise.all([api.get<R<Workspace>>('/workspaces/current'), api.get<R<Member[]>>('/workspaces/current/members')]);
      setCurrent(w.data); setMembers(m.data);
      localStorage.setItem(WS_KEY, id);
    } catch {
      setWorkspaceId(null); setCurrent(null); setMembers([]);
    }
  }, []);

  const reload = useCallback(async (prefer?: string) => {
    const me = await api.get<{ user: User; workspaces: MembershipRef[] }>('/auth/me');
    setUser(me.user); setWorkspaces(me.workspaces);
    const ids = me.workspaces.map((w) => w.workspace._id);
    const saved = typeof window !== 'undefined' ? localStorage.getItem(WS_KEY) : null;
    const pick = [prefer, saved, (me.user as any).currentWorkspace].find((x) => x && ids.includes(x)) || ids[0] || null;
    await loadWorkspace(pick);
  }, [loadWorkspace]);

  useEffect(() => {
    setAuthLostHandler(() => { setToken(null); setUser(null); setWorkspaces([]); setCurrent(null); });
    (async () => {
      const s = await refreshSession();
      if (s) { try { await reload(); } catch { /* fall through to logged-out */ } }
      setReady(true);
    })();
  }, [reload]);

  // theme
  useEffect(() => {
    const pref = user?.preferences?.theme || 'system';
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('cs_theme', pref);
    };
    apply();
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [user?.preferences?.theme]);

  const startSession = useCallback(async (s: { accessToken: string; user: User }) => {
    setToken(s.accessToken);
    await reload();
  }, [reload]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setToken(null); setWorkspaceId(null); setUser(null); setWorkspaces([]); setCurrent(null); setMembers([]);
  }, []);

  const switchWorkspace = useCallback(async (id: string) => { await loadWorkspace(id); }, [loadWorkspace]);
  const reloadWorkspace = useCallback(async () => { if (current) await loadWorkspace(current._id); }, [current, loadWorkspace]);

  const can = useCallback((p: string) => !!current?.permissions?.includes(p), [current]);

  const value = useMemo(
    () => ({ ready, user, workspaces, current, members, can, startSession, logout, reload, reloadWorkspace, switchWorkspace, setUser }),
    [ready, user, workspaces, current, members, can, startSession, logout, reload, reloadWorkspace, switchWorkspace]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
