'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Avatar, Empty, ErrorText, Field, Modal, PageHeader, PageLoader, Tabs } from '@/components/ui';
import { timeAgo, cn } from '@/lib/utils';
import type { Complaint, ComplaintCategory, ComplaintStatus, R } from '@/lib/types';

const CATEGORIES: { id: ComplaintCategory; label: string }[] = [
  { id: 'workload', label: 'Workload' }, { id: 'conduct', label: 'Conduct' }, { id: 'harassment', label: 'Harassment' },
  { id: 'process', label: 'Process' }, { id: 'pay_benefits', label: 'Pay & benefits' }, { id: 'other', label: 'Other' },
];
const STATUS_INFO: Record<ComplaintStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-info/15 text-info' },
  in_review: { label: 'In review', cls: 'bg-accent/25 text-ink' },
  resolved: { label: 'Resolved', cls: 'bg-ok/15 text-ok' },
  dismissed: { label: 'Dismissed', cls: 'bg-surface2 text-muted' },
};

export default function Complaints() {
  const { can, current } = useApp();
  const toast = useToast();
  const manage = can('complaint:manage');
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Complaint | null>(null);

  const load = useCallback(() => api.get<R<Complaint[]>>(`/complaints${status ? `?status=${status}` : ''}`).then((r) => setItems(r.data)).catch((e) => toast(e.message, 'error')), [status, toast]);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('notification:new', (n: any) => n.type === 'workspace' && n.link === '/complaints' && load());

  return (
    <div>
      <PageHeader title="Complaint Box" subtitle={manage ? 'Reports from your team, kept confidential.' : 'Report a concern. You can submit anonymously.'} actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />New complaint</button>} />
      {manage && (
        <div className="mb-4"><Tabs tabs={[{ id: '', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_review', label: 'In review' }, { id: 'resolved', label: 'Resolved' }, { id: 'dismissed', label: 'Dismissed' }]} value={status} onChange={(v) => setStatus(v as any)} /></div>
      )}
      {!items ? <PageLoader /> : items.length === 0 ? (
        <Empty icon={<MessageSquareWarning size={32} />} title="Nothing here" text={manage ? 'No complaints match this filter.' : 'You have not submitted any complaints yet.'} />
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((c) => (
            <li key={c._id}>
              <button onClick={() => setActive(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2">
                {c.anonymous ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-muted"><ShieldAlert size={15} /></span> : <Avatar person={c.submitter} size={32} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.subject}</p>
                  <p className="text-xs text-muted">{CATEGORIES.find((x) => x.id === c.category)?.label} - {manage && !c.anonymous ? c.submitter?.name : c.anonymous ? 'Anonymous' : 'You'} - {timeAgo(c.createdAt)}</p>
                </div>
                <span className={cn('chip shrink-0', STATUS_INFO[c.status].cls)}>{STATUS_INFO[c.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <NewComplaintModal onClose={() => setOpen(false)} onCreated={load} />}
      {active && <ComplaintDetail complaint={active} manage={manage} onClose={() => setActive(null)} onSaved={(c) => { setActive(c); load(); }} />}
    </div>
  );
}

function NewComplaintModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ category: 'other' as ComplaintCategory, subject: '', description: '', anonymous: false });
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.post('/complaints', f); toast('Complaint submitted'); onCreated(); onClose(); } catch (err) { setError((err as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Submit a complaint" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="cx">Submit</button></>}>
      <form id="cx" onSubmit={submit} className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ComplaintCategory })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Subject"><input className="input" required minLength={3} maxLength={150} autoFocus value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Details"><textarea className="input min-h-32" required minLength={10} maxLength={8000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What happened, when, and who was involved" /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /><span>Submit anonymously - admins won't see your name, only that a report came in.</span></label>
      </form>
    </Modal>
  );
}

function ComplaintDetail({ complaint, manage, onClose, onSaved }: { complaint: Complaint; manage: boolean; onClose: () => void; onSaved: (c: Complaint) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(complaint.status);
  const [response, setResponse] = useState(complaint.adminResponse || '');
  const [note, setNote] = useState('');
  async function save() {
    try { const r = await api.patch(`/complaints/${complaint._id}`, { status, adminResponse: response, internalNote: note.trim() || undefined }); setNote(''); toast('Updated'); onSaved(r.data); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <Modal open onClose={onClose} title="Complaint" wide footer={manage ? <><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" onClick={save}>Save changes</button></> : <button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="mb-3 flex items-center gap-2"><span className={cn('chip', STATUS_INFO[complaint.status].cls)}>{STATUS_INFO[complaint.status].label}</span><span className="text-xs text-muted">{CATEGORIES.find((c) => c.id === complaint.category)?.label} - {timeAgo(complaint.createdAt)}</span></div>
      <h3 className="text-lg font-semibold">{complaint.subject}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm">{complaint.description}</p>
      {complaint.adminResponse && !manage && <div className="mt-4 rounded-lg bg-surface2 p-3"><p className="text-xs font-medium text-muted">Response</p><p className="mt-1 text-sm">{complaint.adminResponse}</p></div>}
      {manage && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><select className="input" value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus)}>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          </div>
          <Field label="Response to submitter (they will see this)"><textarea className="input min-h-20" maxLength={4000} value={response} onChange={(e) => setResponse(e.target.value)} /></Field>
          <Field label="Internal note (admins only, never shown to submitter)"><textarea className="input min-h-16" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the record" /></Field>
        </div>
      )}
    </Modal>
  );
}
