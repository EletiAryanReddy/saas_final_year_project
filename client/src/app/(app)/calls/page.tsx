'use client';
import { useEffect, useState } from 'react';
import { Phone, PhoneMissed, PhoneOutgoing, PhoneIncoming, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useCall } from '@/context/Call';
import { Avatar, Empty, PageHeader, PageLoader } from '@/components/ui';
import { fmtDateTime, fmtDuration, cn } from '@/lib/utils';
import type { CallRecord, R } from '@/lib/types';

export default function Calls() {
  const { user, members, current } = useApp();
  const { startCall } = useCall();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  useEffect(() => { api.get<R<CallRecord[]>>('/calls').then((r) => setCalls(r.data)).catch(() => setCalls([])); }, [current?._id]);

  const other = (c: CallRecord) => (c.initiator._id === user?.id ? c.invited[0] : c.initiator);
  const others = members.filter((m) => m.user._id !== user?.id);

  return (
    <div>
      <PageHeader title="Calls" subtitle="Recent audio and video calls." />
      <div className="mb-6 card p-4">
        <p className="mb-2 text-sm font-medium">Start a call</p>
        <div className="flex flex-wrap gap-2">
          {others.slice(0, 8).map((m) => (
            <div key={m.user._id} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2">
              <Avatar person={m.user} size={24} />
              <span className="text-sm">{m.user.name.split(' ')[0]}</span>
              <button className="ml-1 text-muted hover:text-brand" onClick={() => startCall([m.user._id], 'audio')} aria-label={`Audio call ${m.user.name}`}><Phone size={14} /></button>
              <button className="text-muted hover:text-brand" onClick={() => startCall([m.user._id], 'video')} aria-label={`Video call ${m.user.name}`}><Video size={14} /></button>
            </div>
          ))}
          {!others.length && <p className="text-sm text-muted">Invite teammates to start calling.</p>}
        </div>
      </div>
      {!calls ? <PageLoader /> : calls.length === 0 ? <Empty icon={<Phone size={32} />} title="No calls yet" /> : (
        <ul className="card divide-y divide-line">
          {calls.map((c) => {
            const o = other(c);
            const outgoing = c.initiator._id === user?.id;
            const Icon = c.status === 'missed' || c.status === 'rejected' ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
            return (
              <li key={c._id} className="flex items-center gap-3 px-4 py-3">
                <Avatar person={o} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.mode === 'group' ? `Group ${c.type} call` : o?.name}</p>
                  <p className={cn('flex items-center gap-1 text-xs', c.status === 'missed' || c.status === 'rejected' ? 'text-danger' : 'text-muted')}><Icon size={12} />{c.status === 'missed' ? 'No answer' : c.status === 'rejected' ? 'Declined' : c.durationSec ? fmtDuration(c.durationSec) : 'Connected'} - {fmtDateTime(c.startedAt)}</p>
                </div>
                <button className="btn-quiet !p-2" aria-label={`Call ${o?.name}`} onClick={() => startCall(c.mode === 'group' ? c.invited.map((p) => p._id) : [o!._id], c.type)}>{c.type === 'video' ? <Video size={17} /> : <Phone size={17} />}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
