'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pin, StickyNote, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useToast } from '@/context/Toast';
import { Empty, Modal, PageHeader, PageLoader, useDebounced } from '@/components/ui';
import { timeAgo, cn } from '@/lib/utils';
import type { Note, Paged } from '@/lib/types';

const COLORS = ['#F5E9B8', '#C9E7DE', '#D9E3F5', '#F2D6D6', '#E3D9F2', '#FFFFFF'];

export default function Notes() {
  const { current } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Paged<Note> | null>(null);
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const [open, setOpen] = useState<Note | 'new' | null>(null);

  const load = useCallback(() => api.get<Paged<Note>>(`/notes?q=${encodeURIComponent(dq)}&limit=200`).then(setItems).catch(() => {}), [dq]);
  useEffect(() => { load(); }, [load, current?._id]);

  async function togglePin(n: Note) { try { await api.patch(`/notes/${n._id}`, { pinned: !n.pinned }); load(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function remove(n: Note) { if (!confirm('Delete this note?')) return; try { await api.del(`/notes/${n._id}`); load(); } catch (e) { toast((e as Error).message, 'error'); } }

  return (
    <div>
      <PageHeader title="Notes" subtitle="Quick, private notes only you can see." actions={<button className="btn-primary" onClick={() => setOpen('new')}><Plus size={16} />New note</button>} />
      <div className="mb-5 max-w-xs"><input className="input" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" /></div>
      {!items ? <PageLoader /> : items.data.length === 0 ? (
        <Empty icon={<StickyNote size={32} />} title={q ? 'No matches' : 'No notes yet'} text={q ? '' : 'Jot down anything you want to remember.'} action={!q && <button className="btn-primary" onClick={() => setOpen('new')}><Plus size={16} />Write your first note</button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.data.map((n) => (
            <div key={n._id} className="group flex min-h-36 flex-col rounded-xl border border-line p-4 shadow-sm" style={{ background: n.color }}>
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(n)}><p className="truncate font-medium text-[#15222B]">{n.title || 'Untitled'}</p></button>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => togglePin(n)} aria-label={n.pinned ? 'Unpin' : 'Pin'} className={cn('rounded p-1 hover:bg-black/10', n.pinned && 'text-brand')}><Pin size={14} fill={n.pinned ? 'currentColor' : 'none'} /></button>
                  <button onClick={() => remove(n)} aria-label="Delete" className="rounded p-1 text-[#15222B]/60 hover:bg-black/10 hover:text-danger"><Trash2 size={14} /></button>
                </div>
              </div>
              <button className="flex-1 text-left" onClick={() => setOpen(n)}><p className="line-clamp-5 whitespace-pre-wrap break-words text-sm text-[#15222B]/80">{n.body || <span className="italic text-[#15222B]/50">Empty note</span>}</p></button>
              <p className="mt-2 text-xs text-[#15222B]/50">{timeAgo(n.updatedAt)}</p>
            </div>
          ))}
        </div>
      )}
      {open && <NoteModal note={open === 'new' ? null : open} onClose={() => setOpen(null)} onSaved={load} />}
    </div>
  );
}

function NoteModal({ note, onClose, onSaved }: { note: Note | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: note?.title || '', body: note?.body || '', color: note?.color || COLORS[0] });
  async function save() {
    try { if (note) await api.patch(`/notes/${note._id}`, f); else await api.post('/notes', f); onSaved(); onClose(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function remove() { if (!note || !confirm('Delete this note?')) return; try { await api.del(`/notes/${note._id}`); onSaved(); onClose(); } catch (e) { toast((e as Error).message, 'error'); } }
  return (
    <Modal open onClose={onClose} title={note ? 'Edit note' : 'New note'} footer={<>{note && <button className="btn-quiet mr-auto text-danger" onClick={remove}><Trash2 size={15} />Delete</button>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="space-y-3">
        <input className="input font-medium" placeholder="Title" maxLength={120} autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="input min-h-48" placeholder="Write your note..." maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="flex gap-2">{COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c} className={cn('h-7 w-7 rounded-full border border-line', f.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />)}</div>
      </div>
    </Modal>
  );
}
