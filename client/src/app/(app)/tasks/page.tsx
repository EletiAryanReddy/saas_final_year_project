'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Search, CheckSquare } from 'lucide-react';
import { api, qstr } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { TaskModal } from '@/components/TaskModal';
import { AvatarStack, Empty, PageHeader, PageLoader, useDebounced } from '@/components/ui';
import { cn, fmtDate, isOverdue, PRIORITY } from '@/lib/utils';
import type { Paged, Project, Task } from '@/lib/types';

export default function Tasks() {
  const { can, current, members } = useApp();
  const [data, setData] = useState<Paged<Task> | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const [f, setF] = useState({ project: '', priority: '', assignees: 'me', state: 'open', overdue: '' });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ task: Task | null } | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => { api.get<Paged<Project>>('/projects?limit=200').then((r) => setProjects(r.data.filter((p) => p.status !== 'archived'))).catch(() => {}); }, [current?._id]);
  useEffect(() => setPage(1), [dq, f]);

  const load = useCallback(() => api.get<Paged<Task>>(`/tasks${qstr({ ...f, q: dq, page, limit: 25 })}`).then(setData).catch(() => {}), [f, dq, page]);
  useEffect(() => { load(); }, [load, current?._id]);
  const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 500); }, [load]);
  useLive('task:created', soon); useLive('task:updated', soon); useLive('task:deleted', soon); useLive('task:moved', soon);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const sel = 'input !w-auto';
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Everything across your projects." actions={can('task:create') && projects.length > 0 && <button className="btn-primary" onClick={() => setModal({ task: null })}><Plus size={16} />New task</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" /></div>
        <select className={sel} value={f.assignees} onChange={(e) => setF({ ...f, assignees: e.target.value })} aria-label="Assignee"><option value="me">Assigned to me</option><option value="">Anyone</option>{members.map((m) => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}</select>
        <select className={sel} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
        <select className={sel} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Priority"><option value="">Any priority</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className={sel} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} aria-label="State"><option value="open">Open</option><option value="done">Done</option><option value="">All</option></select>
        <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" checked={f.overdue === '1'} onChange={(e) => setF({ ...f, overdue: e.target.checked ? '1' : '' })} />Overdue only</label>
      </div>
      {!data ? <PageLoader /> : data.data.length === 0 ? <Empty icon={<CheckSquare size={32} />} title="No tasks match" text="Adjust the filters, or create a task to get started." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Task</th><th className="px-3 font-medium">Project</th><th className="px-3 font-medium">Priority</th><th className="px-3 font-medium">Assignees</th><th className="px-3 font-medium">Due</th></tr></thead>
            <tbody>
              {data.data.map((t) => {
                const p: any = t.project;
                return (
                  <tr key={t._id} onClick={() => setModal({ task: t })} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface2/60">
                    <td className="px-4 py-2.5"><p className={cn('font-medium', t.completedAt && 'text-muted line-through')}>{t.title}</p>{!!t.tags.length && <div className="mt-1 flex gap-1">{t.tags.map((g) => <span key={g._id} className="rounded px-1.5 text-[10px] font-medium text-white" style={{ background: g.color }}>{g.name}</span>)}</div>}</td>
                    <td className="px-3"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p?.color }} />{p?.name}</span></td>
                    <td className="px-3"><span className={cn('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span></td>
                    <td className="px-3"><AvatarStack people={t.assignees} size={22} /></td>
                    <td className={cn('px-3', isOverdue(t) && 'font-medium text-danger')}>{fmtDate(t.dueDate) || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm text-muted">
            <span>{data.total} task{data.total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2"><button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn-ghost !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>
        </div>
      )}
      <TaskModal open={!!modal} onClose={() => setModal(null)} task={modal?.task} projects={projects} onChanged={load} />
    </div>
  );
}
