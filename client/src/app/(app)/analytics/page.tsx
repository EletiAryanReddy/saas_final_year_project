'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { Avatar, PageHeader, PageLoader, Progress } from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { fmtBytes, cn } from '@/lib/utils';

async function downloadExport(type: string) {
  const blob = await api.blob(`/analytics/export?type=${type}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${type}-report.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Analytics() {
  const { current } = useApp();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => api.get(`/analytics?days=${days}`).then((r) => setD(r.data)).catch(() => {}), [days]);
  useEffect(() => { setD(null); load(); }, [load, current?._id]);
  if (!d) return <PageLoader />;

  const s = d.summary;
  const stat = (label: string, value: string | number, tone?: string) => <div className="card p-4"><p className={cn('font-display text-3xl font-semibold', tone)}>{value}</p><p className="text-sm text-muted">{label}</p></div>;
  return (
    <div>
      <PageHeader title="Analytics" subtitle="How work is moving across the workspace." actions={<>
        <select className="input !w-auto" value={days} onChange={(e) => setDays(+e.target.value)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        <button className="btn-ghost" onClick={() => downloadExport('tasks')}><Download size={16} />Tasks CSV</button>
        <button className="btn-ghost" onClick={() => downloadExport('projects')}><Download size={16} />Projects CSV</button>
      </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stat('Total tasks', s.total)}{stat('Open', s.open)}{stat('Completed', s.done, 'text-ok')}{stat('Overdue', s.overdue, s.overdue ? 'text-danger' : '')}{stat('Completion rate', `${s.completionRate}%`)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><h2 className="mb-1 text-lg font-semibold">Created vs completed</h2><p className="mb-4 text-sm text-muted">Over the last {days} days</p>
          <LineChart series={[{ name: 'Created', color: '#2F7FB8', points: d.timeline.created.map((p: any) => ({ label: p.date.slice(5), value: p.count })) }, { name: 'Completed', color: '#1F8A5B', points: d.timeline.completed.map((p: any) => ({ label: p.date.slice(5), value: p.count })) }]} /></div>
        <div className="card p-5"><h2 className="mb-4 text-lg font-semibold">Open tasks by priority</h2><BarChart data={['urgent', 'high', 'medium', 'low'].map((k) => ({ label: k, value: d.byPriority[k] || 0 }))} /></div>
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">By project</h2>
          <ul className="space-y-3">{d.perProject.map((p: any, i: number) => { const pct = p.total ? Math.round((p.done / p.total) * 100) : 0; return (
            <li key={i}><div className="mb-1 flex items-center justify-between text-sm"><span className="truncate font-medium">{p.project.name}</span><span className="text-muted">{p.done}/{p.total}{p.overdue ? <span className="ml-1.5 text-danger">- {p.overdue} overdue</span> : ''}</span></div><Progress value={pct} /></li>
          ); })}</ul>
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">By teammate</h2>
          <ul className="space-y-3">{d.perMember.map((m: any, i: number) => { const pct = m.assigned ? Math.round((m.completed / m.assigned) * 100) : 0; return (
            <li key={i} className="flex items-center gap-3"><Avatar person={m.user} size={30} /><div className="min-w-0 flex-1"><div className="mb-1 flex items-center justify-between text-sm"><span className="truncate font-medium">{m.user.name}</span><span className="text-muted">{m.completed}/{m.assigned}</span></div><Progress value={pct} /></div></li>
          ); })}</ul>
        </div>
      </div>
    </div>
  );
}
