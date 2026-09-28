'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Settings2, ArrowLeft, Trash2, ChevronUp, ChevronDown, CalendarDays, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { TaskModal } from '@/components/TaskModal';
import { AvatarStack, Avatar, ChipPicker, ErrorText, Field, Modal, PageLoader, Tabs, Progress } from '@/components/ui';
import { cn, fmtDate, isOverdue, PRIORITY, PROJECT_STATUS, toDateInput } from '@/lib/utils';
import type { Column, Project, R, Task } from '@/lib/types';

const PRIO_BAR: Record<string, string> = { low: '#94A3A8', medium: '#2F7FB8', high: '#F2B632', urgent: '#C8443A' };
const projectOf = (t: Task) => (typeof t.project === 'string' ? t.project : t.project._id);
const norm = (t: any): Task => t;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const { can, members } = useApp();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<'board' | 'list' | 'details'>('board');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ task: Task | null; status?: string } | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get<R<{ project: Project; tasks: Task[] }>>(`/projects/${id}/board`); setProject(r.data.project); setTasks(r.data.tasks); }
    catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // ---- realtime ----
  useLive<Task>('task:created', (t) => { if (projectOf(t) === id) setTasks((s) => (s.some((x) => x._id === t._id) ? s : [...s, norm(t)])); });
  useLive<Task>('task:updated', (t) => { if (projectOf(t) === id) setTasks((s) => s.map((x) => (x._id === t._id ? { ...x, ...norm(t) } : x))); });
  useLive<{ _id: string }>('task:deleted', (p) => setTasks((s) => s.filter((x) => x._id !== p._id)));
  useLive<any>('task:moved', (p) => {
    if (p.project !== id) return;
    setTasks((s) => { const m = new Map<string, any>(p.items.map((i: any) => [i._id, i])); return s.map((t) => (m.has(t._id) ? { ...t, status: m.get(t._id).status, order: m.get(t._id).order, ...(t._id === p.taskId ? { completedAt: p.completedAt } : {}) } : t)); });
  });
  useLive<Project>('project:updated', (p) => { if (p._id === id) load(); });

  // deep-link ?task=
  const taskParam = params.get('task');
  const openTask = useMemo(() => (taskParam ? tasks.find((t) => t._id === taskParam) || null : null), [taskParam, tasks]);
  useEffect(() => { if (openTask) setModal({ task: openTask }); }, [openTask?._id]); // eslint-disable-line
  const closeModal = () => { setModal(null); if (taskParam) router.replace(pathname); };

  const byCol = useMemo(() => {
    const m: Record<string, Task[]> = {};
    project?.columns.forEach((c) => (m[c.key] = []));
    tasks.forEach((t) => (m[t.status] ||= []).push(t));
    Object.values(m).forEach((a) => a.sort((x, y) => x.order - y.order));
    return m;
  }, [tasks, project]);

  const canMove = can('task:update');

  async function moveTask(taskId: string, status: string, index: number) {
    const prev = tasks;
    const col = project!.columns.find((c) => c.key === status)!;
    const others = tasks.filter((t) => t.status === status && t._id !== taskId).sort((a, b) => a.order - b.order);
    others.splice(Math.min(index, others.length), 0, tasks.find((t) => t._id === taskId)!);
    const order = new Map(others.map((t, i) => [t._id, i]));
    setTasks(tasks.map((t) => (order.has(t._id) ? { ...t, order: order.get(t._id)!, ...(t._id === taskId ? { status, completedAt: col.isDone ? t.completedAt || new Date().toISOString() : null } : {}) } : t)));
    try { await api.post(`/tasks/${taskId}/move`, { status, index }); } catch (e) { setTasks(prev); toast((e as Error).message, 'error'); }
  }

  const onDragOverCard = (e: React.DragEvent, col: string, i: number) => {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOver({ col, index: i + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
  };
  const onDrop = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    const taskId = drag.current; const o = over;
    drag.current = null; setDragging(null); setOver(null);
    if (!taskId || !o || o.col !== col) return;
    const displayed = byCol[col] || [];
    const idx = displayed.slice(0, o.index).filter((t) => t._id !== taskId).length;
    moveTask(taskId, col, idx);
  };

  async function quickAdd(status: string, title: string) {
    if (!title.trim()) return;
    try { await api.post('/tasks', { project: id, title: title.trim(), status }); } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (error) return <div className="card p-8 text-center"><p className="text-danger">{error}</p><Link href="/projects" className="btn-ghost mt-4">Back to projects</Link></div>;
  if (!project) return <PageLoader />;
  const done = tasks.filter((t) => t.completedAt).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const projectsForModal = [{ _id: project._id, name: project.name, columns: project.columns }];

  return (
    <div className="flex h-full flex-col">
      <Link href="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} />Projects</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ background: project.color }} /><h1 className="truncate text-2xl font-semibold sm:text-3xl">{project.name}</h1><span className="chip bg-surface2 text-muted">{PROJECT_STATUS[project.status]}</span></div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted">
            <AvatarStack people={project.members} />
            {project.deadline && <span className="flex items-center gap-1"><CalendarDays size={14} />Due {fmtDate(project.deadline, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            <span className="flex w-40 items-center gap-2"><Progress value={pct} color={project.color} /><span className="text-xs">{pct}%</span></span>
          </div>
        </div>
        <div className="flex gap-2">
          {can('project:update') && <button className="btn-ghost" onClick={() => setColsOpen(true)}><Settings2 size={16} />Columns</button>}
          {can('task:create') && <button className="btn-primary" onClick={() => setModal({ task: null })}><Plus size={16} />New task</button>}
        </div>
      </div>
      <Tabs tabs={[{ id: 'board', label: 'Board' }, { id: 'list', label: 'List', count: tasks.length }, { id: 'details', label: 'Details' }]} value={tab} onChange={setTab} />

      {tab === 'board' && (
        <div className="mt-4 flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
          {project.columns.map((col) => {
            const list = byCol[col.key] || [];
            return (
              <section key={col.key} className={cn('flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-surface2/70 transition-colors', over?.col === col.key && dragging && 'ring-2 ring-brand/50')}
                onDragOver={(e) => { if (!canMove) return; e.preventDefault(); if (!list.length || e.target === e.currentTarget) setOver({ col: col.key, index: list.length }); }}
                onDrop={(e) => canMove && onDrop(e, col.key)} aria-label={`${col.name} column`}>
                <header className="flex items-center gap-2 px-3 pb-2 pt-3"><span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} /><h3 className="text-sm font-semibold">{col.name}</h3><span className="text-xs text-muted">{list.length}</span>{col.isDone && <span className="ml-auto text-[11px] text-ok">counts as done</span>}</header>
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {list.map((t, i) => (
                    <div key={t._id}>
                      {over?.col === col.key && over.index === i && dragging && dragging !== t._id && <div className="mb-2 h-1 rounded-full bg-brand" />}
                      <article draggable={canMove} onDragStart={(e) => { drag.current = t._id; setDragging(t._id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { drag.current = null; setDragging(null); setOver(null); }}
                        onDragOver={(e) => canMove && onDragOverCard(e, col.key, i)} onClick={() => setModal({ task: t })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setModal({ task: t })}
                        className={cn('cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-sm transition hover:shadow-md', dragging === t._id && 'opacity-40', canMove && 'active:cursor-grabbing')} style={{ borderLeft: `3px solid ${PRIO_BAR[t.priority]}` }}>
                        {!!t.tags.length && <div className="mb-1.5 flex flex-wrap gap-1">{t.tags.map((g) => <span key={g._id} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: g.color }}>{g.name}</span>)}</div>}
                        <p className={cn('text-sm font-medium', t.completedAt && 'text-muted line-through')}>{t.title}</p>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className={cn('flex items-center gap-1 text-xs', isOverdue(t) ? 'font-medium text-danger' : 'text-muted')}>{t.dueDate && <><CalendarDays size={12} />{fmtDate(t.dueDate)}</>}</span>
                          <AvatarStack people={t.assignees} size={22} max={3} />
                        </div>
                      </article>
                    </div>
                  ))}
                  {over?.col === col.key && over.index >= list.length && dragging && <div className="h-1 rounded-full bg-brand" />}
                  {!list.length && <p className="px-2 py-6 text-center text-xs text-muted">{canMove ? 'Drop tasks here' : 'No tasks'}</p>}
                </div>
                {can('task:create') && <QuickAdd onAdd={(title) => quickAdd(col.key, title)} />}
              </section>
            );
          })}
        </div>
      )}

      {tab === 'list' && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Task</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Priority</th><th className="px-3 font-medium">Assignees</th><th className="px-3 font-medium">Due</th></tr></thead>
            <tbody>
              {[...tasks].sort((a, b) => project.columns.findIndex((c) => c.key === a.status) - project.columns.findIndex((c) => c.key === b.status) || a.order - b.order).map((t) => (
                <tr key={t._id} onClick={() => setModal({ task: t })} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface2/60">
                  <td className={cn('px-4 py-2.5 font-medium', t.completedAt && 'text-muted line-through')}>{t.title}</td>
                  <td className="px-3">{project.columns.find((c) => c.key === t.status)?.name}</td>
                  <td className="px-3"><span className={cn('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span></td>
                  <td className="px-3"><AvatarStack people={t.assignees} size={22} /></td>
                  <td className={cn('px-3', isOverdue(t) && 'font-medium text-danger')}>{fmtDate(t.dueDate) || '-'}</td>
                </tr>
              ))}
              {!tasks.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No tasks yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'details' && <Details project={project} members={members} onSaved={load} canEdit={can('project:update')} canDelete={can('project:delete')} onDeleted={() => router.replace('/projects')} />}

      <TaskModal open={!!modal} onClose={closeModal} task={modal?.task} projects={projectsForModal} projectId={id} defaultStatus={modal?.status} onChanged={load} />
      {colsOpen && <ColumnsModal project={project} onClose={() => setColsOpen(false)} onSaved={() => { setColsOpen(false); load(); }} />}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="m-2 mt-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink"><Plus size={15} />Add task</button>;
  return (
    <div className="p-2 pt-0">
      <input autoFocus className="input" placeholder="Task title, then Enter" value={v} maxLength={200} onChange={(e) => setV(e.target.value)} onBlur={() => !v && setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(v); setV(''); } if (e.key === 'Escape') { setV(''); setOpen(false); } }} />
    </div>
  );
}

function Details({ project, members, onSaved, canEdit, canDelete, onDeleted }: { project: Project; members: any[]; onSaved: () => void; canEdit: boolean; canDelete: boolean; onDeleted: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: project.name, description: project.description || '', status: project.status, deadline: toDateInput(project.deadline), members: project.members.map((m) => m._id) });
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.patch(`/projects/${project._id}`, { ...f, deadline: f.deadline ? new Date(f.deadline + 'T12:00:00').toISOString() : null }); toast('Project saved'); onSaved(); } catch (err) { setError((err as Error).message); }
  }
  async function del() {
    if (!confirm(`Delete "${project.name}" and all of its tasks? This cannot be undone.`)) return;
    try { await api.del(`/projects/${project._id}`); toast('Project deleted'); onDeleted(); } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={save} className="card mt-4 max-w-2xl space-y-4 p-5">
      <ErrorText>{error}</ErrorText>
      <Field label="Name"><input className="input" required disabled={!canEdit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Description"><textarea className="input min-h-24" disabled={!canEdit} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status"><select className="input" disabled={!canEdit} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as any })}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Deadline"><input type="date" className="input" disabled={!canEdit} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
      </div>
      <div><span className="label">Members</span><ChipPicker options={members.map((m) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={f.members} onChange={(v) => canEdit && setF({ ...f, members: v })} /></div>
      {canEdit && <div className="flex justify-between"><button className="btn-primary">Save changes</button>{canDelete && <button type="button" className="btn-quiet text-danger" onClick={del}><Trash2 size={15} />Delete project</button>}</div>}
    </form>
  );
}

function ColumnsModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [cols, setCols] = useState<Column[]>(project.columns.map((c) => ({ ...c })));
  const [error, setError] = useState('');
  const move = (i: number, d: number) => setCols((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const upd = (i: number, p: Partial<Column>) => setCols((c) => c.map((x, k) => (k === i ? { ...x, ...p } : x)));
  async function save() {
    setError('');
    try { await api.put(`/projects/${project._id}/columns`, { columns: cols }); onSaved(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Board columns" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save columns</button></>}>
      <p className="mb-3 text-sm text-muted">Rename, reorder or add columns. Tasks in a removed column move to the first column. Exactly one column marks work as done.</p>
      <ErrorText>{error}</ErrorText>
      <ul className="mt-2 space-y-2">
        {cols.map((c, i) => (
          <li key={c.key} className="flex items-center gap-2">
            <input type="color" aria-label="Colour" value={c.color} onChange={(e) => upd(i, { color: e.target.value })} className="h-9 w-9 shrink-0 cursor-pointer rounded border border-line bg-surface p-0.5" />
            <input className="input" value={c.name} maxLength={30} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Column name" />
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted"><input type="radio" name="done" checked={c.isDone} onChange={() => setCols(cols.map((x, k) => ({ ...x, isDone: k === i })))} />Done</label>
            <button className="btn-quiet !p-1.5" onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp size={16} /></button>
            <button className="btn-quiet !p-1.5" onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown size={16} /></button>
            <button className="btn-quiet !p-1.5 text-danger" disabled={cols.length <= 2} onClick={() => setCols(cols.filter((_, k) => k !== i))} aria-label="Remove column"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      {cols.length < 10 && <button className="btn-ghost mt-3" onClick={() => setCols([...cols, { key: `col_${Math.random().toString(36).slice(2, 8)}`, name: 'New column', color: '#6B7C86', isDone: false }])}><Plus size={15} />Add column</button>}
    </Modal>
  );
}
