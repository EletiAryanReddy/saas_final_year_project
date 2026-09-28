export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const initials = (name = '?') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';

export const fmtDate = (d?: string | Date | null, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString(undefined, o) : '';
export const fmtTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
export const fmtDateTime = (d?: string | Date | null) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

export const timeAgo = (d: string | Date) => {
  const s = Math.round((Date.now() - +new Date(d)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 604800) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(d);
};

/** value for <input type="datetime-local"> in the user's local zone */
export const toLocalInput = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const toDateInput = (d?: string | Date | null) => (d ? toLocalInput(d).slice(0, 10) : '');

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const fmtDuration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

export const PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'bg-surface2 text-muted' },
  medium: { label: 'Medium', cls: 'bg-info/15 text-info' },
  high: { label: 'High', cls: 'bg-accent/25 text-ink' },
  urgent: { label: 'Urgent', cls: 'bg-danger/15 text-danger' },
};
export const PROJECT_STATUS: Record<string, string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', archived: 'Archived' };

export const isOverdue = (t: { dueDate?: string; completedAt?: string | null }) => !!t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date();
export const dmName = (c: { type: string; name?: string; members: { _id: string; name: string }[] }, meId?: string) =>
  c.type === 'dm' ? c.members.find((m) => m._id !== meId)?.name || 'Direct message' : c.name || 'Chat';

/** where to go after auth (e.g. back to an invite link) */
export const NEXT_KEY = 'cs_next';
export const takeNext = () => {
  const n = typeof window !== 'undefined' ? sessionStorage.getItem(NEXT_KEY) : null;
  if (n) sessionStorage.removeItem(NEXT_KEY);
  return n && n.startsWith('/') ? n : '/dashboard';
};
