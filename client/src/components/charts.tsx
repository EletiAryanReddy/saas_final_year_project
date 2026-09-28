'use client';
import { useState } from 'react';

/** Dependency-free SVG charts. */
export function BarChart({ data, height = 140, color = 'rgb(var(--brand))' }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
        {data.map((d, i) => (
          <div key={i} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-bg">{d.value}</span>}
            <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(d.value ? 4 : 2, (d.value / max) * 100)}%`, background: d.value ? color : 'rgb(var(--line))' }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">{data.map((d, i) => <span key={i} className="flex-1 truncate text-center text-[11px] text-muted">{d.label}</span>)}</div>
    </div>
  );
}

export function LineChart({ series, height = 180 }: { series: { name: string; color: string; points: { label: string; value: number }[] }[]; height?: number }) {
  const W = 600, H = height, P = 24;
  const n = series[0]?.points.length || 0;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const x = (i: number) => P + (n <= 1 ? 0 : (i * (W - P * 2)) / (n - 1));
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const labels = series[0]?.points || [];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Line chart of ${series.map((s) => s.name).join(' and ')}`}>
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="rgb(var(--line))" strokeDasharray="3 4" /><text x={4} y={y(max * t) + 4} fontSize="10" fill="rgb(var(--muted))">{Math.round(max * t)}</text></g>)}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
            {s.points.length <= 31 && s.points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r="2.5" fill={s.color}><title>{`${s.name} - ${p.label}: ${p.value}`}</title></circle>)}
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => n > 0 && a.indexOf(v) === i).map((i) => <text key={i} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="rgb(var(--muted))">{labels[i]?.label}</text>)}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted">{series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}
