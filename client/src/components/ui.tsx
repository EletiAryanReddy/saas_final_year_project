'use client';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import type { Person } from '@/lib/types';

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-muted" aria-label="Loading" />;
}
export const PageLoader = () => <div className="flex h-48 items-center justify-center"><Spinner size={24} /></div>;

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl outline-none sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-quiet !p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const HUES = ['#0F5A55', '#2F7FB8', '#B4530A', '#7C3AED', '#1F8A5B', '#C8443A', '#8A6D00'];
const hue = (s = '') => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function Avatar({ person, size = 32, online }: { person?: Partial<Person> | null; size?: number; online?: boolean }) {
  const name = person?.name || '?';
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} title={name}>
      {person?.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={person.avatar} alt={name} className="h-full w-full rounded-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center rounded-full font-medium text-white" style={{ background: hue(name), fontSize: size * 0.38 }}>{initials(name)}</span>}
      {online !== undefined && <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface', online ? 'bg-ok' : 'bg-muted/50')} />}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: Partial<Person>[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => <span key={p._id || i} className="rounded-full ring-2 ring-surface"><Avatar person={p} size={size} /></span>)}
      {people.length > max && <span className="flex items-center justify-center rounded-full bg-surface2 text-[11px] font-medium text-muted ring-2 ring-surface" style={{ width: size, height: size }}>+{people.length - max}</span>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors', value === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Progress = ({ value, color }: { value: number; color?: string }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, value)}%`, background: color }} />
  </div>
);

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>;
}

/** Toggleable chips for picking several items (people, tags). */
export function ChipPicker({ options, value, onChange, empty = 'Nothing to pick yet' }: { options: { id: string; label: string; color?: string; person?: Partial<Person> }[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  if (!options.length) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button type="button" key={o.id} aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cn('chip border transition-colors', on ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink')}>
            {o.person && <Avatar person={o.person} size={16} />}
            {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const Badge = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('chip bg-surface2 text-muted', className)}>{children}</span>;

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p> : null;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v as T;
}
