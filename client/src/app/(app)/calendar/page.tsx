'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Video, ListTodo, FolderKanban } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { ChipPicker, ErrorText, Field, Modal, PageHeader, PageLoader } from '@/components/ui';
import { cn, fmtTime, toLocalInput } from '@/lib/utils';
import type { EventItem } from '@/lib/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dkey = (d: Date) => d.toISOString().slice(0, 10);

export default function CalendarPage() {
  const { can, members, current } = useApp();
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<{ event?: EventItem; date?: Date } | null>(null);
  const [selected, setSelected] = useState<string>(dkey(new Date()));

  const range = useMemo(() => {
    const from = new Date(month); from.setDate(from.getDate() - from.getDay()); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 42);
    return { from, to };
  }, [month]);

  const load = useCallback(() => api.get(`/calendar?from=${range.from.toISOString()}&to=${range.to.toISOString()}`).then((r) => setData(r.data)).catch(() => {}), [range]);
  useEffect(() => { setData(null); load(); }, [load, current?._id]);
  useLive('event:created', load); useLive('event:updated', load); useLive('event:deleted', load); useLive('meeting:created', load); useLive('meeting:updated', load); useLive('task:updated', load); useLive('project:updated', load);

  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => { const d = new Date(range.from); d.setDate(d.getDate() + i); return d; }), [range]);
  const items = useMemo(() => {
    if (!data) return new Map<string, any[]>();
    const m = new Map<string, any[]>();
    const push = (key: string, item: any) => m.set(key, [...(m.get(key) || []), item]);
    data.events.forEach((e: EventItem) => { for (let d = new Date(e.start); d <= new Date(e.end || e.start); d.setDate(d.getDate() + 1)) { push(dkey(d), { kind: e.type, ...e }); if (dkey(d) === dkey(new Date(e.end || e.start))) break; } });
    data.taskDeadlines.forEach((t: any) => push(dkey(new Date(t.dueDate)), { kind: 'task', ...t }));
    data.projectDeadlines.forEach((p: any) => push(dkey(new Date(p.deadline)), { kind: 'project', ...p }));
    return m;
  }, [data]);

  const dayItems = items.get(selected) || [];
  const today = dkey(new Date());
  const shift = (n: number) => setMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + n); return d; });

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Events, meetings and deadlines." actions={can('event:create') && <button className="btn-primary" onClick={() => setOpen({ date: new Date(selected) })}><Plus size={16} />New event</button>} />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-1"><button className="btn-quiet !p-2" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><button className="btn-ghost !py-1.5 text-sm" onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); setSelected(dkey(new Date())); }}>Today</button><button className="btn-quiet !p-2" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button></div>
      </div>
      {!data ? <PageLoader /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">{DOW.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = dkey(d); const inMonth = d.getMonth() === month.getMonth(); const list = items.get(key) || [];
                return (
                  <button key={key} onClick={() => setSelected(key)} className={cn('flex min-h-20 flex-col items-start gap-1 border-b border-r border-line/60 p-1.5 text-left', !inMonth && 'bg-surface2/40 text-muted', selected === key && 'bg-brand/10')}>
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs', key === today && 'bg-brand text-brand-ink font-semibold')}>{d.getDate()}</span>
                    <div className="flex w-full flex-col gap-0.5">
                      {list.slice(0, 2).map((it, i) => <span key={i} className="truncate rounded px-1 text-[10px] font-medium text-white" style={{ background: it.color || (it.kind === 'task' ? '#B4530A' : '#0F5A55') }}>{it.title || it.name}</span>)}
                      {list.length > 2 && <span className="text-[10px] text-muted">+{list.length - 2} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 font-semibold">{new Date(selected + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            {dayItems.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
              <ul className="space-y-2">
                {dayItems.map((it, i) => (
                  <li key={i} onClick={() => it.kind !== 'task' && it.kind !== 'project' && setOpen({ event: it })} className={cn('rounded-lg border border-line p-2.5', it.kind !== 'task' && it.kind !== 'project' && 'cursor-pointer hover:bg-surface2')}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted">{it.kind === 'meeting' ? <Video size={12} /> : it.kind === 'task' ? <ListTodo size={12} /> : it.kind === 'project' ? <FolderKanban size={12} /> : null}{it.kind === 'task' ? 'Task due' : it.kind === 'project' ? 'Project deadline' : !it.allDay ? `${fmtTime(it.start)}-${fmtTime(it.end)}` : 'All day'}</p>
                    <p className="text-sm font-medium">{it.title || it.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {open && <EventModal init={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} members={members} canDelete={can('event:delete') || can('event:delete:own')} />}
    </div>
  );
}

function EventModal({ init, onClose, onSaved, members, canDelete }: any) {
  const toast = useToast();
  const e: EventItem | undefined = init.event;
  const [f, setF] = useState({ title: e?.title || '', description: e?.description || '', start: toLocalInput(e?.start) || toLocalInput(init.date) || toLocalInput(new Date()), end: toLocalInput(e?.end) || toLocalInput(new Date(+(init.date || new Date()) + 3600e3)), location: e?.location || '', attendees: e?.attendees.map((a: any) => a._id) || [] });
  const [error, setError] = useState('');
  const readOnly = !!e?.meeting;
  async function save(ev: React.FormEvent) {
    ev.preventDefault(); setError('');
    const body = { ...f, start: new Date(f.start).toISOString(), end: new Date(f.end).toISOString() };
    try { if (e) await api.patch(`/calendar/events/${e._id}`, body); else await api.post('/calendar/events', body); toast('Saved'); onSaved(); } catch (err) { setError((err as Error).message); }
  }
  async function del() { if (e && confirm('Delete this event?')) { try { await api.del(`/calendar/events/${e._id}`); onSaved(); } catch (err) { toast((err as Error).message, 'error'); } } }
  return (
    <Modal open onClose={onClose} title={e ? 'Event' : 'New event'} footer={<>{e && canDelete && !readOnly && <button className="btn-quiet mr-auto text-danger" onClick={del}>Delete</button>}<button className="btn-ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button className="btn-primary" form="ev">Save</button>}</>}>
      {readOnly && <p className="mb-3 rounded-lg bg-surface2 px-3 py-2 text-xs text-muted">This event is linked to a meeting. Edit it from Meetings.</p>}
      <form id="ev" onSubmit={save} className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <Field label="Title"><input className="input" required disabled={readOnly} maxLength={120} value={f.title} onChange={(v) => setF({ ...f, title: v.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Start"><input type="datetime-local" className="input" required disabled={readOnly} value={f.start} onChange={(v) => setF({ ...f, start: v.target.value })} /></Field><Field label="End"><input type="datetime-local" className="input" required disabled={readOnly} value={f.end} onChange={(v) => setF({ ...f, end: v.target.value })} /></Field></div>
        <Field label="Location"><input className="input" disabled={readOnly} value={f.location} onChange={(v) => setF({ ...f, location: v.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-20" disabled={readOnly} value={f.description} onChange={(v) => setF({ ...f, description: v.target.value })} /></Field>
        <div><span className="label">Attendees</span><ChipPicker options={members.map((m: any) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={f.attendees} onChange={(v: string[]) => !readOnly && setF({ ...f, attendees: v })} /></div>
      </form>
    </Modal>
  );
}
