'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Video, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useCall } from '@/context/Call';
import { useToast } from '@/context/Toast';
import { AvatarStack, ChipPicker, Empty, ErrorText, Field, Modal, PageHeader, PageLoader } from '@/components/ui';
import { fmtDateTime, cn } from '@/lib/utils';
import type { Meeting, Paged } from '@/lib/types';

export default function Meetings() {
  const { can, members, current } = useApp();
  const { joinMeeting, call } = useCall();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Paged<Meeting> | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', startsAt: '', participants: [] as string[] });
  const [error, setError] = useState('');

  const load = useCallback(() => api.get<Paged<Meeting>>('/meetings?limit=50').then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('meeting:created', load); useLive('meeting:updated', load); useLive('meeting:deleted', load);

  async function schedule(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.post('/meetings', { ...f, startsAt: new Date(f.startsAt).toISOString() }); setOpen(false); setF({ title: '', startsAt: '', participants: [] }); toast('Meeting scheduled'); load(); }
    catch (err) { setError((err as Error).message); }
  }
  async function instant() {
    try { const r = await api.post('/meetings/instant', {}); router.push(`/meetings/${r.data._id}`); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div>
      <PageHeader title="Meetings" subtitle="Video rooms for your team." actions={<>
        {can('meeting:create') && <button className="btn-ghost" onClick={instant} disabled={!!call}><Radio size={16} />Start instant meeting</button>}
        {can('meeting:create') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Schedule</button>}
      </>} />
      {!items ? <PageLoader /> : items.data.length === 0 ? <Empty icon={<Video size={32} />} title="No meetings yet" text="Schedule one, or start an instant meeting." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.data.map((m) => (
            <div key={m._id} className="card p-4">
              <div className="flex items-center justify-between"><span className={cn('chip', m.status === 'live' ? 'bg-ok/15 text-ok' : m.status === 'ended' ? 'bg-surface2 text-muted' : 'bg-info/15 text-info')}>{m.status === 'live' ? 'Live now' : m.status === 'ended' ? 'Ended' : 'Scheduled'}</span></div>
              <h3 className="mt-2 truncate font-semibold">{m.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{fmtDateTime(m.startsAt)}</p>
              <div className="mt-3 flex items-center justify-between"><AvatarStack people={m.participants} /><Link href={`/meetings/${m._id}`} className="btn-ghost !py-1.5 text-sm">{m.status === 'ended' ? 'View' : 'Join'}</Link></div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Schedule a meeting" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" form="sched">Schedule</button></>}>
        <form id="sched" onSubmit={schedule} className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="Title"><input className="input" required maxLength={120} autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Start"><input type="datetime-local" className="input" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
          <div><span className="label">Participants</span><ChipPicker options={members.map((m) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={f.participants} onChange={(v) => setF({ ...f, participants: v })} /></div>
        </form>
      </Modal>
    </div>
  );
}
