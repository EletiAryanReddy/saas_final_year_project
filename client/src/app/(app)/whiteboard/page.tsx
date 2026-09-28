'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, PenTool } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Empty, Field, Modal, PageHeader, PageLoader } from '@/components/ui';
import { timeAgo } from '@/lib/utils';
import type { Paged, Whiteboard } from '@/lib/types';

export default function WhiteboardList() {
  const { can, current } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Paged<Whiteboard> | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(() => api.get<Paged<Whiteboard>>('/whiteboards?limit=100').then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('whiteboard:created', load); useLive('whiteboard:deleted', load);

  async function create() {
    try { const r = await api.post('/whiteboards', { name: name.trim() || 'Untitled board' }); router.push(`/whiteboard/${r.data._id}`); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div>
      <PageHeader title="Whiteboard" subtitle="Sketch and brainstorm together in real time." actions={can('whiteboard:create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New board</button>} />
      {!items ? <PageLoader /> : items.data.length === 0 ? <Empty icon={<PenTool size={32} />} title="No boards yet" action={can('whiteboard:create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Create a board</button>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.data.map((b) => (
            <Link key={b._id} href={`/whiteboard/${b._id}`} className="card flex aspect-[4/3] flex-col justify-between p-4 hover:shadow-md">
              <PenTool size={22} className="text-brand" />
              <div><p className="truncate font-medium">{b.name}</p><p className="text-xs text-muted">Updated {timeAgo(b.updatedAt)}</p></div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New board" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        <Field label="Name"><input autoFocus className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
      </Modal>
    </div>
  );
}
