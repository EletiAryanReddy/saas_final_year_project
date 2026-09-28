'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useSocket, useLive } from '@/context/Socket';
import { Avatar, Empty, PageHeader, PageLoader } from '@/components/ui';
import { timeAgo, cn } from '@/lib/utils';
import type { Notification, R } from '@/lib/types';

export default function Notifications() {
  const { current } = useApp();
  const { setUnread } = useSocket();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const load = () => api.get<{ data: Notification[] }>('/notifications?limit=50').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, [current?._id]); // eslint-disable-line
  useLive<Notification>('notification:new', (n) => setItems((s) => (s ? [n, ...s] : s)));

  async function readAll() { await api.post('/notifications/read-all').catch(() => {}); setUnread(0); load(); }
  async function open(n: Notification) {
    if (!n.read) { await api.patch(`/notifications/${n._id}/read`).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); }
    if (n.link) router.push(n.link);
    load();
  }

  return (
    <div>
      <PageHeader title="Notifications" actions={items?.some((i) => !i.read) && <button className="btn-ghost" onClick={readAll}><Check size={15} />Mark all read</button>} />
      {!items ? <PageLoader /> : items.length === 0 ? <Empty icon={<Bell size={32} />} title="You're all caught up" /> : (
        <ul className="card divide-y divide-line">
          {items.map((n) => (
            <li key={n._id}><button onClick={() => open(n)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface2', !n.read && 'bg-brand/5')}>
              <Avatar person={n.actor} size={34} />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="truncate text-sm text-muted">{n.body}</p>}<p className="mt-0.5 text-xs text-muted">{timeAgo(n.createdAt)}</p></div>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
