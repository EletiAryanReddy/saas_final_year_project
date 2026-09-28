'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, BookOpen, History, Trash2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Empty, ErrorText, Field, Modal, PageLoader, useDebounced } from '@/components/ui';
import { timeAgo, cn } from '@/lib/utils';
import type { R, WikiPage as WikiPageT } from '@/lib/types';

const ICONS = ['📄', '📘', '📝', '💡', '🎯', '🚀', '🧭', '🗂️'];

function Inner() {
  const { can, current } = useApp();
  const toast = useToast();
  const router = useRouter();
  const pParam = useSearchParams().get('p');
  const [pages, setPages] = useState<WikiPageT[] | null>(null);
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [newOpen, setNewOpen] = useState(false);
  const [versions, setVersions] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get<R<WikiPageT[]>>(`/wiki?q=${encodeURIComponent(dq)}&limit=200`).then((r) => setPages(r.data)).catch(() => {}), [dq]);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('wiki:created', load); useLive('wiki:deleted', load);

  useEffect(() => { if (pParam) setActiveId(pParam); }, [pParam]);
  useEffect(() => { if (!activeId && pages?.length) setActiveId(pages[0]._id); }, [pages, activeId]);
  useEffect(() => { if (activeId) { setEditing(false); setVersions(null); api.get<R<any>>(`/wiki/${activeId}`).then((r) => { setPage(r.data); setDraft({ title: r.data.title, content: r.data.content || '' }); }).catch(() => setPage(null)); } }, [activeId]);
  useLive('wiki:updated', (p: any) => { if (p._id === activeId) setPage((cur: any) => cur && { ...cur, title: p.title }); load(); });

  const byParent = (parent: string | null) => (pages || []).filter((p) => (p.parent || null) === parent);
  const roots = byParent(null);

  async function createPage(parent: string | null, title: string, icon: string) {
    try { const r = await api.post<R<any>>('/wiki', { title, parent, icon, content: '' }); setNewOpen(false); await load(); setActiveId(r.data._id); router.replace(`/wiki?p=${r.data._id}`); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function save() {
    if (!page) return; setError('');
    try { const r = await api.patch<R<any>>(`/wiki/${page._id}`, draft); setPage(r.data); setEditing(false); toast('Saved'); load(); } catch (e) { setError((e as Error).message); }
  }
  async function remove(p: WikiPageT) {
    if (!confirm(`Delete "${p.title}"? Sub-pages will move up a level.`)) return;
    try { await api.del(`/wiki/${p._id}`); if (activeId === p._id) setActiveId(null); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function openVersions() { if (page) setVersions((await api.get(`/wiki/${page._id}/versions`)).data); }
  async function restore(i: number) {
    if (!page || !confirm('Restore this version? The current content will be saved as a version too.')) return;
    const r = await api.post<R<any>>(`/wiki/${page._id}/restore`, { index: i });
    setPage((c: any) => ({ ...c, ...r.data })); setDraft({ title: r.data.title, content: r.data.content }); setVersions(null); toast('Restored');
  }

  const Tree = ({ parent, depth = 0 }: { parent: string | null; depth?: number }) => (
    <>{byParent(parent).map((p) => (
      <div key={p._id}>
        <div className={cn('group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface2', activeId === p._id && 'bg-surface2 font-medium')} style={{ paddingLeft: 8 + depth * 14 }}>
          <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => { setActiveId(p._id); router.replace(`/wiki?p=${p._id}`); }}><span>{p.icon}</span><span className="truncate">{p.title}</span></button>
          {can('wiki:delete') && <button className="hidden text-muted hover:text-danger group-hover:block" onClick={() => remove(p)} aria-label="Delete"><Trash2 size={13} /></button>}
        </div>
        <Tree parent={p._id} depth={depth + 1} />
      </div>
    ))}</>
  );

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-3"><h2 className="font-semibold">Wiki</h2>{can('wiki:create') && <button className="btn-quiet !p-1.5" onClick={() => setNewOpen(true)} aria-label="New page"><Plus size={17} /></button>}</div>
        <div className="border-b border-line p-2"><div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input !py-1.5 !pl-8 text-sm" placeholder="Search pages" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        <div className="flex-1 overflow-y-auto p-2">{!pages ? <PageLoader /> : roots.length === 0 ? <p className="px-2 py-4 text-sm text-muted">No pages yet.</p> : <Tree parent={null} />}</div>
      </aside>
      <section className="min-w-0 flex-1 rounded-xl border border-line bg-surface p-6">
        {!page ? <Empty icon={<BookOpen size={32} />} title="No page selected" text="Pick a page, or create one." /> : (
          <div className="mx-auto max-w-2xl">
            <ErrorText>{error}</ErrorText>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted">Last edited {timeAgo(page.updatedAt)}{page.updatedBy && ` by ${page.updatedBy.name}`}</div>
              <div className="flex gap-2">
                <button className="btn-quiet !py-1.5 text-sm" onClick={openVersions}><History size={14} />History</button>
                {can('wiki:update') && !editing && <button className="btn-ghost !py-1.5 text-sm" onClick={() => setEditing(true)}>Edit</button>}
                {editing && <><button className="btn-ghost !py-1.5 text-sm" onClick={() => { setEditing(false); setDraft({ title: page.title, content: page.content || '' }); }}>Cancel</button><button className="btn-primary !py-1.5 text-sm" onClick={save}>Save</button></>}
              </div>
            </div>
            {editing ? (
              <div className="space-y-3">
                <input className="input font-display text-2xl font-semibold" value={draft.title} maxLength={150} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <textarea className="input min-h-[50vh] font-mono text-sm leading-relaxed" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Write in Markdown..." />
              </div>
            ) : (
              <div><h1 className="font-display text-3xl font-semibold">{page.icon} {page.title}</h1><div className="prose-wiki mt-5 whitespace-pre-wrap text-[15px] leading-relaxed">{page.content || <span className="text-muted">This page is empty.</span>}</div></div>
            )}
          </div>
        )}
      </section>
      {newOpen && <NewPageModal onClose={() => setNewOpen(false)} onCreate={createPage} pages={pages || []} />}
      {versions && <Modal open onClose={() => setVersions(null)} title="Version history">
        {versions.length === 0 ? <p className="text-sm text-muted">No earlier versions yet - they appear after you edit this page.</p> : (
          <ul className="divide-y divide-line">{versions.map((v) => (
            <li key={v.index} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{v.title}</p><p className="text-xs text-muted">{v.editedBy?.name} - {timeAgo(v.editedAt)}</p></div><button className="btn-ghost !py-1 text-sm shrink-0" onClick={() => restore(v.index)}>Restore</button></li>
          ))}</ul>
        )}
      </Modal>}
    </div>
  );
}

function NewPageModal({ onClose, onCreate, pages }: { onClose: () => void; onCreate: (parent: string | null, title: string, icon: string) => void; pages: WikiPageT[] }) {
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('📄'); const [parent, setParent] = useState('');
  return (
    <Modal open onClose={onClose} title="New page" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!title.trim()} onClick={() => onCreate(parent || null, title.trim(), icon)}>Create</button></>}>
      <div className="space-y-4">
        <div><span className="label">Icon</span><div className="flex flex-wrap gap-1.5">{ICONS.map((i) => <button key={i} type="button" onClick={() => setIcon(i)} className={cn('flex h-9 w-9 items-center justify-center rounded-lg border text-lg', icon === i ? 'border-brand bg-brand/10' : 'border-line')}>{i}</button>)}</div></div>
        <Field label="Title"><input autoFocus className="input" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && onCreate(parent || null, title.trim(), icon)} /></Field>
        <Field label="Parent page (optional)"><select className="input" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Top level</option>{pages.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.title}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

export default function Wiki() { return <Suspense><Inner /></Suspense>; }
