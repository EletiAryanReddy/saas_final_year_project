'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FolderKanban, CalendarDays, Search } from 'lucide-react';
import { api, qstr } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { AvatarStack, ChipPicker, Empty, ErrorText, Field, Modal, PageHeader, PageLoader, Progress, useDebounced } from '@/components/ui';
import { fmtDate, PROJECT_STATUS, cn } from '@/lib/utils';
import type { Paged, Project } from '@/lib/types';

const STATUS_TONE: Record<string, string> = { planning: 'bg-info/15 text-info', active: 'bg-ok/15 text-ok', on_hold: 'bg-accent/25 text-ink', completed: 'bg-brand/15 text-brand', archived: 'bg-surface2 text-muted' };
const COLORS = ['#0F5A55', '#2F7FB8', '#B4530A', '#7C3AED', '#1F8A5B', '#C8443A'];

export default function Projects() {
  const { can, members, current } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Project[] | null>(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', description: '', deadline: '', status: 'active', color: COLORS[0], members: [] as string[] });
  const [error, setError] = useState('');

  const load = useCallback(() => api.get<Paged<Project>>(`/projects${qstr({ q: dq, status, limit: 100 })}`).then((r) => setItems(r.data)).catch((e) => toast(e.message, 'error')), [dq, status, toast]);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('project:created', load); useLive('project:updated', load); useLive('project:deleted', load); useLive('task:moved', load);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      await api.post('/projects', { ...f, deadline: f.deadline ? new Date(f.deadline).toISOString() : undefined });
      setOpen(false); setF({ ...f, name: '', description: '', deadline: '', members: [] }); toast('Project created'); load();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div>
      <PageHeader title="Projects" subtitle="Boards, deadlines and who is on what." actions={can('project:create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New project</button>} />
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Filter projects" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter projects" /></div>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {!items ? <PageLoader /> : items.length === 0 ? (
        <Empty icon={<FolderKanban size={32} />} title={q || status ? 'No projects match' : 'No projects yet'} text={q || status ? 'Try clearing the filters.' : 'Projects hold your tasks, board and deadlines.'} action={!q && !status && can('project:create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Create your first project</button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const pct = p.stats?.total ? Math.round((p.stats.done / p.stats.total) * 100) : 0;
            return (
              <Link key={p._id} href={`/projects/${p._id}`} className="card group overflow-hidden transition-shadow hover:shadow-md">
                <div className="h-1.5" style={{ background: p.color }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-semibold group-hover:text-brand">{p.name}</h3><span className={cn('chip shrink-0', STATUS_TONE[p.status])}>{PROJECT_STATUS[p.status]}</span></div>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">{p.description || 'No description'}</p>
                  <div className="mt-4"><div className="mb-1.5 flex justify-between text-xs text-muted"><span>{p.stats?.done || 0} of {p.stats?.total || 0} tasks</span><span>{pct}%</span></div><Progress value={pct} color={p.color} /></div>
                  <div className="mt-4 flex items-center justify-between">
                    <AvatarStack people={p.members} />
                    <div className="flex items-center gap-3 text-xs text-muted">
                      {!!p.stats?.overdue && <span className="font-medium text-danger">{p.stats.overdue} overdue</span>}
                      {p.deadline && <span className="flex items-center gap-1"><CalendarDays size={13} />{fmtDate(p.deadline)}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New project" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" form="new-project">Create project</button></>}>
        <form id="new-project" onSubmit={create} className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="Name"><input className="input" required maxLength={80} autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input min-h-20" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadline"><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
            <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(PROJECT_STATUS).filter(([k]) => k !== 'archived').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <div><span className="label">Colour</span><div className="flex gap-2">{COLORS.map((c) => <button type="button" key={c} onClick={() => setF({ ...f, color: c })} aria-label={`Colour ${c}`} aria-pressed={f.color === c} className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface', f.color === c && 'ring-2 ring-ink')} style={{ background: c }} />)}</div></div>
          <div><span className="label">Members (you are added automatically)</span><ChipPicker options={members.map((m) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={f.members} onChange={(v) => setF({ ...f, members: v })} /></div>
        </form>
      </Modal>
    </div>
  );
}
