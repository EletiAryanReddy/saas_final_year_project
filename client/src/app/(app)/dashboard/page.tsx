'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, AlertTriangle, FolderKanban, ListTodo } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useSocket, useLive } from '@/context/Socket';
import { Avatar, PageHeader, PageLoader, Empty } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { fmtDate, timeAgo, PRIORITY, cn } from '@/lib/utils';
import type { ActivityItem } from '@/lib/types';

export default function Dashboard() {
  const { user, current } = useApp();
  const { online } = useSocket();
  const [d, setD] = useState<any>(null);
  const timer = useRef<any>(null);

  const load = useCallback(() => api.get('/dashboard').then((r) => setD(r.data)).catch(() => {}), []);
  useEffect(() => { setD(null); load(); }, [load, current?._id]);
  const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 600); }, [load]);
  useLive('task:created', soon); useLive('task:updated', soon); useLive('task:deleted', soon); useLive('task:moved', soon); useLive('project:created', soon);
  useLive<ActivityItem>('activity:new', (a) => setD((p: any) => p && { ...p, recentActivity: [a, ...p.recentActivity].slice(0, 12) }));

  if (!d) return <PageLoader />;
  const hour = new Date().getHours();
  const stat = (icon: any, label: string, value: number, tone = '') => {
    const I = icon;
    return (
      <div className="card p-4">
        <div className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface2', tone)}><I size={18} /></div>
        <p className="font-display text-3xl font-semibold">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    );
  };
  const activeProjects = (d.projects.active || 0) + (d.projects.planning || 0);
  return (
    <div>
      <PageHeader title={`Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0]}`} subtitle={`Here is what is happening in ${current?.name}.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stat(ListTodo, 'Assigned to me', d.tasks.mine, 'text-brand')}
        {stat(Clock, 'Open tasks', d.tasks.open, 'text-info')}
        {stat(AlertTriangle, 'Overdue', d.tasks.overdue, d.tasks.overdue ? 'text-danger' : '')}
        {stat(CheckCircle2, 'Completed', d.tasks.done, 'text-ok')}
        {stat(FolderKanban, 'Active projects', activeProjects)}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">Tasks completed this week</h2>
          <p className="mb-4 text-sm text-muted">Across the whole workspace</p>
          <BarChart data={d.productivity.map((p: any) => ({ label: new Date(p.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }), value: p.count }))} />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">Due soon (mine)</h2>
          {d.dueSoon.length === 0 ? <p className="text-sm text-muted">Nothing due. Nice.</p> : (
            <ul className="space-y-2.5">
              {d.dueSoon.map((t: any) => (
                <li key={t._id}>
                  <Link href={`/projects/${t.project?._id}?task=${t._id}`} className="block rounded-lg p-2 hover:bg-surface2">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted"><span className={cn('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span>{t.project?.name} - {fmtDate(t.dueDate)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          {d.recentActivity.length === 0 ? <Empty title="No activity yet" text="Create a project or a task and it will show up here." /> : (
            <ul className="divide-y divide-line">
              {d.recentActivity.map((a: ActivityItem) => (
                <li key={a._id} className="flex items-center gap-3 py-2.5">
                  <Avatar person={a.actor} size={28} />
                  <p className="min-w-0 flex-1 truncate text-sm"><b>{a.actor?.name || 'Someone'}</b> {a.message}</p>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Team</h2><Link href="/team" className="text-sm text-brand hover:underline">Manage</Link></div>
          <ul className="space-y-2.5">
            {d.team.map((m: any) => (
              <li key={m.user._id} className="flex items-center gap-2.5">
                <Avatar person={m.user} size={30} online={online.has(m.user._id)} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.user.name}</p><p className="text-xs capitalize text-muted">{m.role}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
