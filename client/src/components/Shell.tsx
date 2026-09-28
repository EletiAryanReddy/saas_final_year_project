'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, CheckSquare, CalendarDays, Video, MessageSquare, Phone, FolderOpen, BookOpen, PenTool,
  Users, BarChart3, CreditCard, Settings, Bell, Search, Menu, X, ChevronDown, Plus, LogOut, Check,
  Sparkles, StickyNote, MessageSquareWarning, Megaphone,
} from 'lucide-react';
import { useApp } from '@/context/App';
import { useSocket, useLive } from '@/context/Socket';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { Avatar, useDebounced } from './ui';

const NAV = [
  { group: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { group: 'Work', items: [
    { href: '/projects', label: 'Projects', icon: FolderKanban }, { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays }, { href: '/meetings', label: 'Meetings', icon: Video } ] },
  { group: 'Talk', items: [{ href: '/chat', label: 'Chat', icon: MessageSquare }, { href: '/calls', label: 'Calls', icon: Phone }] },
  { group: 'Knowledge', items: [
    { href: '/files', label: 'Files', icon: FolderOpen }, { href: '/wiki', label: 'Wiki', icon: BookOpen }, { href: '/whiteboard', label: 'Whiteboard', icon: PenTool },
    { href: '/notes', label: 'Notes', icon: StickyNote } ] },
  { group: 'Support', items: [
    { href: '/ai', label: 'AI Assistant', icon: Sparkles }, { href: '/complaints', label: 'Complaint Box', icon: MessageSquareWarning } ] },
  { group: 'Workspace', items: [
    { href: '/team', label: 'Team', icon: Users }, { href: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics:read' },
    { href: '/billing', label: 'Billing', icon: CreditCard, perm: 'billing:read' }, { href: '/settings', label: 'Settings', icon: Settings } ] },
] as { group: string; items: { href: string; label: string; icon: any; perm?: string }[] }[];

function WorkspaceSwitcher() {
  const { current, workspaces, switchWorkspace } = useApp();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative px-3 pt-4">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 text-left hover:bg-white/10">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-display text-sm font-bold text-[#15222B]">{initials(current?.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{current?.name}</span>
          <span className="block text-xs capitalize text-side-ink/70">{current?.plan} plan</span>
        </span>
        <ChevronDown size={16} className="text-side-ink/70" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 z-30 mt-1 rounded-lg border border-line bg-surface p-1 text-ink shadow-xl">
          {workspaces.map((m) => (
            <button key={m.workspace._id} onClick={async () => { await switchWorkspace(m.workspace._id); setOpen(false); router.push('/dashboard'); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface2">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-brand text-[10px] font-bold text-brand-ink">{initials(m.workspace.name)}</span>
              <span className="flex-1 truncate">{m.workspace.name}</span>
              {m.workspace._id === current?._id && <Check size={14} className="text-brand" />}
            </button>
          ))}
          <button onClick={() => { setOpen(false); router.push('/onboarding?new=1'); }} className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2 py-2 text-sm text-muted hover:bg-surface2 hover:text-ink">
            <Plus size={16} /> Create workspace
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useApp();
  return (
    <div className="flex h-full flex-col bg-side text-side-ink">
      <div className="px-5 pt-5 font-display text-xl font-bold tracking-tight text-white">CollabSpace</div>
      <WorkspaceSwitcher />
      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          return (
            <div key={g.group} className="mt-4">
              <p className="px-2.5 pb-1 text-xs font-medium text-side-ink/55">{g.group}</p>
              {items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + '/');
                return (
                  <Link key={i.href} href={i.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors', active ? 'bg-white/12 font-medium text-white' : 'hover:bg-white/8')}>
                    <i.icon size={17} className={active ? 'text-accent' : ''} />{i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [res, setRes] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dq.trim().length < 2) { setRes(null); return; }
    api.get(`/search?q=${encodeURIComponent(dq.trim())}`).then((r) => setRes(r.data)).catch(() => setRes(null));
  }, [dq]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  const empty = res && !res.projects.length && !res.tasks.length && !res.wiki.length && !res.files.length;
  const Group = ({ title, children }: any) => (children.length ? <div className="py-1"><p className="px-3 py-1 text-xs font-medium text-muted">{title}</p>{children}</div> : null);
  const Row = ({ label, sub, href }: any) => <button onClick={() => go(href)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface2"><span className="truncate">{label}</span>{sub && <span className="shrink-0 text-xs text-muted">{sub}</span>}</button>;
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input !pl-9" placeholder="Search projects, tasks, wiki, files" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Search" />
      {open && res && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          {empty && <p className="px-3 py-3 text-sm text-muted">Nothing matches "{dq}".</p>}
          <Group title="Projects">{res.projects.map((p: any) => <Row key={p._id} label={p.name} href={`/projects/${p._id}`} />)}</Group>
          <Group title="Tasks">{res.tasks.map((t: any) => <Row key={t._id} label={t.title} sub={t.project?.name} href={`/projects/${t.project?._id}?task=${t._id}`} />)}</Group>
          <Group title="Wiki">{res.wiki.map((w: any) => <Row key={w._id} label={`${w.icon || ''} ${w.title}`} href={`/wiki?p=${w._id}`} />)}</Group>
          <Group title="Files">{res.files.map((f: any) => <Row key={f._id} label={f.name} sub={f.kind} href="/files" />)}</Group>
        </div>
      )}
    </div>
  );
}

function Bell_() {
  const { unread } = useSocket();
  return (
    <Link href="/notifications" className="btn-quiet relative !p-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
      <Bell size={19} />
      {unread > 0 && <span className="absolute right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

function AnnouncementBanner() {
  const [item, setItem] = useState<{ _id: string; body: string; createdBy: { name: string } } | null>(null);
  useLive<{ _id: string; body: string; createdBy: { name: string } }>('announcement:new', (a) => setItem(a));
  if (!item) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-line bg-accent/15 px-4 py-2 text-sm">
      <Megaphone size={16} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1 truncate"><b>{item.createdBy?.name || 'Someone'}:</b> {item.body}</p>
      <button className="btn-quiet !p-1" onClick={() => setItem(null)} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { user, logout, current } = useApp();
  const { connected, error: socketError } = useSocket();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 lg:block"><Sidebar /></aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]"><Sidebar onNavigate={() => setDrawer(false)} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AnnouncementBanner />
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <button className="btn-quiet !p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">{drawer ? <X size={20} /> : <Menu size={20} />}</button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <span title={connected ? 'Realtime connected' : `Realtime disconnected${socketError ? ': ' + socketError : ''}`} className={cn('mr-1 h-2 w-2 rounded-full', connected ? 'bg-ok' : 'bg-accent')} />
            <Bell_ />
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface2" aria-label="Account menu"><Avatar person={user ? { name: user.name, avatar: user.avatar } : null} size={30} /></button>
              {menu && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
                  <div className="border-b border-line px-3 py-2"><p className="truncate text-sm font-medium">{user?.name}</p><p className="truncate text-xs text-muted">{user?.email}</p><p className="mt-0.5 text-xs capitalize text-muted">{current?.role} in {current?.name}</p></div>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface2" onClick={() => { setMenu(false); router.push('/settings'); }}><Settings size={15} />Settings</button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-surface2" onClick={async () => { await logout(); router.replace('/login'); }}><LogOut size={15} />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
