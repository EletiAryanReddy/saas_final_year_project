'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Folder, File, Upload, FolderPlus, Download, Trash2, Search, ChevronRight, Home } from 'lucide-react';
import { api, fetchFile, qstr } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Empty, ErrorText, Field, Modal, PageHeader, PageLoader, useDebounced } from '@/components/ui';
import { fmtBytes, fmtDate, cn } from '@/lib/utils';
import type { FileItem } from '@/lib/types';

const PREVIEWABLE = /^image\/|^application\/pdf|^text\//;

export default function Files() {
  const { can, current } = useApp();
  const toast = useToast();
  const [parent, setParent] = useState<string | null>(null);
  const [items, setItems] = useState<FileItem[] | null>(null);
  const [crumbs, setCrumbs] = useState<{ _id: string; name: string }[]>([]);
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const [newFolder, setNewFolder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(() => api.get(`/files${qstr({ parent: parent || 'root', q: dq })}`).then((r) => { setItems(r.data); setCrumbs(r.breadcrumbs); }).catch((e) => toast(e.message, 'error')), [parent, dq, toast]);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('file:created', load); useLive('file:updated', load); useLive('file:deleted', load);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    [...files].forEach((f) => form.append('files', f));
    if (parent) form.append('parent', parent);
    try { await api.upload('/files/upload', form); toast(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function mkFolder(name: string) {
    try { await api.post('/files/folder', { name, parent }); setNewFolder(false); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function remove(item: FileItem) {
    if (!confirm(item.kind === 'folder' ? `Delete "${item.name}" and everything inside it?` : `Delete "${item.name}"?`)) return;
    try { await api.del(`/files/${item._id}`); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }} className={cn('min-h-full rounded-xl', dragOver && 'outline-dashed outline-2 outline-brand')}>
      <PageHeader title="Files" subtitle="Shared documents and media." actions={can('file:create') && <>
        <button className="btn-ghost" onClick={() => setNewFolder(true)}><FolderPlus size={16} />New folder</button>
        <button className="btn-primary" onClick={() => inputRef.current?.click()}><Upload size={16} />Upload</button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm text-muted">
          <button onClick={() => { setParent(null); setQ(''); }} className="flex items-center gap-1 hover:text-ink"><Home size={14} />Files</button>
          {crumbs.map((c) => <span key={c._id} className="flex items-center gap-1"><ChevronRight size={13} /><button onClick={() => { setParent(c._id); setQ(''); }} className="hover:text-ink">{c.name}</button></span>)}
        </div>
        <div className="relative ml-auto min-w-52 max-w-xs flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Search all files" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!items ? <PageLoader /> : items.length === 0 ? <Empty icon={<Folder size={32} />} title={q ? 'No matches' : 'This folder is empty'} text={q ? '' : 'Drag files here, or use Upload.'} /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Name</th><th className="px-3 font-medium">Size</th><th className="px-3 font-medium">Added</th><th className="w-20"></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id} className="group border-b border-line/60 last:border-0 hover:bg-surface2/60">
                  <td className="px-4 py-2.5">
                    <button className="flex items-center gap-2 text-left" onClick={() => (it.kind === 'folder' ? (setParent(it._id), setQ('')) : PREVIEWABLE.test(it.mimeType || '') ? fetchFile(it._id, it.name, 'view') : fetchFile(it._id, it.name, 'download'))}>
                      {it.kind === 'folder' ? <Folder size={17} className="text-brand" /> : <File size={17} className="text-muted" />}
                      <span className="font-medium">{it.name}</span>
                    </button>
                  </td>
                  <td className="px-3 text-muted">{it.kind === 'file' ? fmtBytes(it.size) : '-'}</td>
                  <td className="px-3 text-muted">{fmtDate(it.createdAt)}</td>
                  <td className="px-3"><div className="hidden justify-end gap-1 group-hover:flex">{it.kind === 'file' && <button className="btn-quiet !p-1.5" onClick={() => fetchFile(it._id, it.name, 'download')} aria-label="Download"><Download size={15} /></button>}<button className="btn-quiet !p-1.5 text-danger" onClick={() => remove(it)} aria-label="Delete"><Trash2 size={15} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {newFolder && <FolderModal onClose={() => setNewFolder(false)} onCreate={mkFolder} />}
    </div>
  );
}

function FolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (n: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal open onClose={onClose} title="New folder" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>Create</button></>}>
      <Field label="Folder name"><input autoFocus className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name.trim())} /></Field>
    </Modal>
  );
}
