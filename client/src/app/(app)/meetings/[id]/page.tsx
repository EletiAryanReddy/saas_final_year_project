'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useCall } from '@/context/Call';
import { useApp } from '@/context/App';
import { AvatarStack, PageLoader } from '@/components/ui';
import { fmtDateTime } from '@/lib/utils';
import type { Meeting, R } from '@/lib/types';

export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { current, user } = useApp();
  const { call, joinMeeting } = useCall();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get<R<Meeting>>(`/meetings/${id}`).then((r) => setMeeting(r.data)).catch((e) => setError(e.message)); }, [id]);
  const inThisCall = call?.meeting && call.roomId === meeting?.roomId;

  if (error) return <div className="card p-8 text-center"><p className="text-danger">{error}</p></div>;
  if (!meeting) return <PageLoader />;
  return (
    <div className="mx-auto max-w-lg">
      <button onClick={() => router.push('/meetings')} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} />Meetings</button>
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand"><Video size={26} /></div>
        <h1 className="text-2xl font-semibold">{meeting.title}</h1>
        <p className="mt-1 text-sm text-muted">{fmtDateTime(meeting.startsAt)}</p>
        {meeting.description && <p className="mt-3 text-sm">{meeting.description}</p>}
        <div className="mt-4 flex justify-center"><AvatarStack people={meeting.participants} /></div>
        <div className="mt-6">
          {meeting.status === 'ended' ? <p className="text-sm text-muted">This meeting has ended.</p>
            : inThisCall ? <p className="text-sm font-medium text-ok">You are in this meeting</p>
            : call ? <p className="text-sm text-muted">Leave your current call first.</p>
            : <button className="btn-primary" onClick={() => joinMeeting(meeting.roomId, meeting.title, meeting.host._id === user?.id)}><Video size={16} />Join meeting</button>}
        </div>
      </div>
    </div>
  );
}
