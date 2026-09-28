'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useToast } from '@/context/Toast';
import { PageHeader, PageLoader, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function Billing() {
  const { current, can, reloadWorkspace } = useApp();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api.get('/billing').then((r) => setD(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load, current?._id]);

  async function choose(planId: string) {
    setBusy(planId);
    try { await api.post('/billing/checkout', { plan: planId }); toast(`Switched to the ${planId} plan`); await reloadWorkspace(); load(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }
  if (!d) return <PageLoader />;
  const u = d.usage;
  const row = (label: string, value: number, limit: number, fmt: (n: number) => string = String) => (
    <div><div className="mb-1 flex justify-between text-sm"><span className="text-muted">{label}</span><span>{fmt(value)} of {limit >= 100000 ? 'unlimited' : fmt(limit)}</span></div><Progress value={limit >= 100000 ? 0 : (value / limit) * 100} /></div>
  );
  return (
    <div>
      <PageHeader title="Billing" subtitle={`${current?.name} is on the ${d.plan.name} plan.`} />
      <div className="card mb-6 grid gap-6 p-5 sm:grid-cols-3">
        {row('Members', u.members + u.pendingInvites, d.plan.limits.members)}
        {row('Projects', u.projects, d.plan.limits.projects)}
        {row('Storage', u.storageMB, d.plan.limits.storageMB, (n) => `${n} MB`)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {d.plans.map((p: any) => {
          const current_ = p.id === d.plan.id;
          return (
            <div key={p.id} className={cn('card flex flex-col p-5', current_ && 'ring-2 ring-brand')}>
              <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{p.name}</h3>{current_ && <span className="chip bg-brand/15 text-brand">Current</span>}</div>
              <p className="mt-1 text-3xl font-semibold">${p.priceMonthly}<span className="text-sm font-normal text-muted">/mo</span></p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">{p.features.map((f: string) => <li key={f} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" />{f}</li>)}</ul>
              {can('billing:manage') && <button disabled={current_ || busy === p.id} className={cn('mt-5', current_ ? 'btn-ghost' : 'btn-primary')} onClick={() => choose(p.id)}>{current_ ? 'Current plan' : busy === p.id ? 'Switching...' : `Switch to ${p.name}`}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
