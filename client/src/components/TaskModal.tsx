'use client';
import { useEffect, useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Avatar, ChipPicker, ErrorText, Field, Modal } from './ui';
import { PRIORITY, timeAgo, toDateInput, cn } from '@/lib/utils';
import type { Column, Comment, Project, R, Tag, Task } from '@/lib/types';

interface Props {
  open: boolean; onClose: () => void; task?: Task | null;
  projects: Pick<Project, '_id' | 'name' | 'columns'>[]; projectId?: string; defaultStatus?: string;
  onChanged?: () => void;
}
const pid = (t?: Task | null) => (t ? (typeof t.project === 'string' ? t.project : t.project._id) : '');

export function TaskModal({ open, onClose, task, projects, projectId, defaultStatus, onChanged }: Props) {
  const { members, can, user } = useApp();
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [f, setF] = useState({ title: '', description: '', project: '', status: '', priority: 'medium', dueDate: '', assignees: [] as string[], tags: [] as string[] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const editing = !!task;
  const readOnly = editing ? !can('task:update') : !can('task:create');

  useEffect(() => {
    if (!open) return;
    setError(''); setDraft('');
    const p = pid(task) || projectId || projects[0]?._id || '';
    const cols = projects.find((x) => x._id === p)?.columns || [];
    setF({
      title: task?.title || '', description: task?.description || '', project: p,
      status: task?.status || defaultStatus || cols[0]?.key || '', priority: task?.priority || 'medium', dueDate: toDateInput(task?.dueDate),
      assignees: task?.assignees.map((a) => a._id) || [], tags: task?.tags.map((t) => t._id) || [],
    });
    api.get<{ data: Tag[] }>('/tags?limit=200').then((r) => setTags(r.data)).catch(() => {});
    if (task) api.get<R<Comment[]>>(`/tasks/${task._id}/comments`).then((r) => setComments(r.data)).catch(() => {});
    else setComments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?._id]);

  useLive<{ task: string; comment: Comment }>('comment:new', (p) => { if (task && p.task === task._id) setComments((c) => (c.some((x) => x._id === p.comment._id) ? c : [...c, p.comment])); });
  useLive<{ _id: string }>('comment:deleted', (p) => setComments((c) => c.filter((x) => x._id !== p._id)));

  const columns: Column[] = projects.find((x) => x._id === f.project)?.columns || [];

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const body: any = { title: f.title, description: f.description, status: f.status, priority: f.priority, assignees: f.assignees, tags: f.tags, dueDate: f.dueDate ? new Date(f.dueDate + 'T12:00:00').toISOString() : null };
    try {
      if (editing) await api.patch(`/tasks/${task!._id}`, body);
      else await api.post('/tasks', { ...body, project: f.project });
      toast(editing ? 'Task saved' : 'Task created'); onChanged?.(); onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!task || !confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try { await api.del(`/tasks/${task._id}`); toast('Task deleted'); onChanged?.(); onClose(); } catch (err) { setError((err as Error).message); }
  }

  async function addComment() {
    if (!draft.trim() || !task) return;
    try { const r = await api.post<R<Comment>>(`/tasks/${task._id}/comments`, { body: draft }); setComments((c) => (c.some((x) => x._id === r.data._id) ? c : [...c, r.data])); setDraft(''); }
    catch (err) { toast((err as Error).message, 'error'); }
  }

  const mayDelete = task && (can('task:delete') || (can('task:delete:own') && task.createdBy === user?.id));

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? 'Task' : 'New task'}
      footer={<>
        {editing && mayDelete && <button type="button" className="btn-quiet mr-auto text-danger" onClick={remove}><Trash2 size={15} />Delete</button>}
        <button className="btn-ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
        {!readOnly && <button className="btn-primary" form="task-form" disabled={busy}>{editing ? 'Save changes' : 'Create task'}</button>}
      </>}>
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <form id="task-form" onSubmit={save} className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="Title"><input className="input" required maxLength={200} autoFocus={!editing} disabled={readOnly} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input min-h-28" maxLength={10000} disabled={readOnly} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Add context, links, acceptance criteria" /></Field>
          <div><span className="label">Assignees</span><ChipPicker options={members.map((m) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={f.assignees} onChange={(v) => !readOnly && setF({ ...f, assignees: v })} /></div>
          <div><span className="label">Tags</span><ChipPicker options={tags.map((t) => ({ id: t._id, label: t.name, color: t.color }))} value={f.tags} onChange={(v) => !readOnly && setF({ ...f, tags: v })} empty="No tags yet. Create them in Settings." /></div>
        </form>
        <div className="space-y-4">
          {!editing && <Field label="Project"><select className="input" value={f.project} onChange={(e) => { const c = projects.find((x) => x._id === e.target.value)?.columns[0]?.key || ''; setF({ ...f, project: e.target.value, status: c }); }}>{projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>}
          <Field label="Status"><select className="input" disabled={readOnly} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></Field>
          <Field label="Priority"><select className="input" disabled={readOnly} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Due date"><input type="date" className="input" disabled={readOnly} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
      </div>

      {editing && (
        <section className="mt-6 border-t border-line pt-4">
          <h3 className="mb-3 text-base font-semibold">Comments <span className="text-sm font-normal text-muted">{comments.length}</span></h3>
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c._id} className="group flex gap-2.5">
                <Avatar person={c.createdBy} size={28} />
                <div className="min-w-0 flex-1 rounded-lg bg-surface2 px-3 py-2">
                  <p className="text-xs text-muted"><b className="text-ink">{c.createdBy.name}</b> - {timeAgo(c.createdAt)}
                    {(c.createdBy._id === user?.id || can('comment:delete')) && <button className="ml-2 hidden text-danger group-hover:inline" onClick={() => api.del(`/tasks/comments/${c._id}`).catch(() => {})}>delete</button>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                </div>
              </li>
            ))}
            {comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
          </ul>
          {can('comment:create') && (
            <div className="mt-3 flex gap-2">
              <input className="input" placeholder="Write a comment" value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addComment())} />
              <button type="button" className={cn('btn-primary', !draft.trim() && 'opacity-60')} onClick={addComment} aria-label="Send comment"><Send size={16} /></button>
            </div>
          )}
        </section>
      )}
    </Modal>
  );
}
