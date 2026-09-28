'use client';
import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useToast } from '@/context/Toast';
import { Avatar, Empty, PageHeader, PageLoader } from '@/components/ui';
import { fmtTime, cn } from '@/lib/utils';
import type { AiMessage, R } from '@/lib/types';

export default function AiAssistant() {
  const { user, current } = useApp();
  const toast = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<AiMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/ai/status').then((r) => setConfigured(r.data.configured)).catch(() => setConfigured(false));
    api.get<R<AiMessage[]>>('/ai/messages').then((r) => setMsgs(r.data)).catch(() => setMsgs([]));
  }, [current?._id]);

  useEffect(() => { requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight)); }, [msgs?.length, sending]);

  async function send() {
    const message = draft.trim();
    if (!message || sending) return;
    setDraft(''); setSending(true);
    setMsgs((s) => [...(s || []), { _id: `tmp-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString() }]);
    try {
      const r = await api.post('/ai/chat', { message });
      setMsgs((s) => [...(s || []).filter((m) => !m._id.startsWith('tmp-')), r.data.user, r.data.assistant]);
    } catch (e) {
      setMsgs((s) => (s || []).filter((m) => !m._id.startsWith('tmp-')));
      setDraft(message);
      toast((e as Error).message, 'error');
    } finally { setSending(false); }
  }

  async function clear() {
    if (!confirm('Clear this conversation? This cannot be undone.')) return;
    try { await api.del('/ai/messages'); setMsgs([]); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="AI Assistant" subtitle="Ask for help drafting, planning or thinking things through." actions={!!msgs?.length && <button className="btn-ghost" onClick={clear}><Trash2 size={15} />Clear chat</button>} />
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-surface">
        {configured === false && (
          <div className="border-b border-line bg-accent/10 px-4 py-2.5 text-sm">The AI assistant is not configured yet. An administrator needs to set <code className="rounded bg-surface2 px-1 py-0.5">ANTHROPIC_API_KEY</code> on the server.</div>
        )}
        {!msgs ? <PageLoader /> : (
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {msgs.length === 0 && <Empty icon={<Sparkles size={28} />} title="Ask me anything" text="Draft a task, plan a sprint, summarize a decision - whatever helps." />}
            {msgs.map((m) => (
              <div key={m._id} className={cn('flex items-start gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
                {m.role === 'user' ? <Avatar person={user ? { name: user.name, avatar: user.avatar } : null} size={28} /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Sparkles size={14} /></span>}
                <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.role === 'user' ? 'bg-brand text-brand-ink' : 'bg-surface2')}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <span className="mt-0.5 block text-right text-[10px] opacity-70">{fmtTime(m.createdAt)}</span>
                </div>
              </div>
            ))}
            {sending && <div className="flex items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Sparkles size={14} /></span><div className="flex items-center gap-1.5 rounded-2xl bg-surface2 px-3.5 py-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" />Thinking...</div></div>}
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-line p-3">
          <input className="input" placeholder="Ask the assistant..." value={draft} maxLength={8000} disabled={sending} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
          <button className={cn('btn-primary', (!draft.trim() || sending) && 'opacity-60')} disabled={!draft.trim() || sending} onClick={send} aria-label="Send"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
