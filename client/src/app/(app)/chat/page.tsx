'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, Plus, Phone, Video, Pencil, Trash2, X, Check, Hash, Users as UsersIcon } from 'lucide-react';
import { api, qstr } from '@/lib/api';
import { useApp } from '@/context/App';
import { useSocket, useLive } from '@/context/Socket';
import { useCall } from '@/context/Call';
import { useToast } from '@/context/Toast';
import { Avatar, ChipPicker, Empty, Field, Modal, PageLoader } from '@/components/ui';
import { cn, dmName, fmtTime, timeAgo } from '@/lib/utils';
import type { Conversation, Message, R } from '@/lib/types';

function Inner() {
  const { user, members, current } = useApp();
  const { socket, online } = useSocket();
  const { startCall, call } = useCall();
  const toast = useToast();
  const router = useRouter();
  const cParam = useSearchParams().get('c');

  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState<string[]>([]);
  const [newChat, setNewChat] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typers = useRef<Map<string, any>>(new Map());
  const active = convs?.find((c) => c._id === activeId) || null;

  const loadConvs = useCallback(() => api.get<R<Conversation[]>>('/chat/conversations').then((r) => { setConvs(r.data); return r.data; }).catch(() => []), []);
  useEffect(() => { setConvs(null); loadConvs().then((list) => { const pick = cParam && list.some((c) => c._id === cParam) ? cParam : list[0]?._id; if (pick) setActiveId(pick); }); }, [loadConvs, current?._id]); // eslint-disable-line
  useEffect(() => { if (cParam) setActiveId(cParam); }, [cParam]);

  const loadMsgs = useCallback(async (id: string) => {
    setMsgs([]);
    const r = await api.get<{ data: Message[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`);
    setMsgs(r.data); setHasMore(r.hasMore);
    api.post(`/chat/conversations/${id}/read`).catch(() => {});
    setConvs((cs) => cs?.map((c) => (c._id === id ? { ...c, unread: 0 } : c)) || cs);
    requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));
  }, []);
  useEffect(() => { if (activeId) loadMsgs(activeId); }, [activeId, loadMsgs]);

  useEffect(() => { if (activeId && socket) { socket.emit('chat:join', { conversationId: activeId }); return () => { socket.emit('chat:leave', { conversationId: activeId }); }; } }, [activeId, socket]);

  useLive<Message>('chat:message', (m) => {
    setConvs((cs) => cs?.map((c) => (c._id === m.conversation ? { ...c, lastMessageAt: m.createdAt, lastMessagePreview: m.body.slice(0, 80), unread: c._id === activeId ? 0 : c.unread + (m.sender._id === user?.id ? 0 : 1) } : c)).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)) || cs);
    if (m.conversation === activeId) { setMsgs((s) => (s.some((x) => x._id === m._id) ? s : [...s, m])); requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight)); api.post(`/chat/conversations/${activeId}/read`).catch(() => {}); }
  });
  useLive<Message>('chat:message-updated', (m) => setMsgs((s) => s.map((x) => (x._id === m._id ? m : x))));
  useLive<Conversation>('chat:conversation', (c) => setConvs((cs) => (cs?.some((x) => x._id === c._id) ? cs : [c, ...(cs || [])])));
  useLive<{ conversationId: string; userId: string; name: string; isTyping: boolean }>('chat:typing', (p) => {
    if (p.conversationId !== activeId || p.userId === user?.id) return;
    clearTimeout(typers.current.get(p.userId));
    if (p.isTyping) { setTyping((t) => (t.includes(p.name) ? t : [...t, p.name])); typers.current.set(p.userId, setTimeout(() => setTyping((t) => t.filter((n) => n !== p.name)), 3000)); }
    else setTyping((t) => t.filter((n) => n !== p.name));
  });

  async function send() {
    const body = draft.trim(); if (!body || !activeId) return;
    setDraft(''); socket?.emit('chat:typing', { conversationId: activeId, isTyping: false });
    try { await api.post(`/chat/conversations/${activeId}/messages`, { body }); } catch (e) { toast((e as Error).message, 'error'); }
  }
  function onType(v: string) { setDraft(v); if (activeId) socket?.emit('chat:typing', { conversationId: activeId, isTyping: v.length > 0 }); }
  async function saveEdit() { if (!editing) return; try { await api.patch(`/chat/messages/${editing.id}`, { body: editing.body }); setEditing(null); } catch (e) { toast((e as Error).message, 'error'); } }
  async function del(id: string) { if (confirm('Delete this message?')) await api.del(`/chat/messages/${id}`).catch((e) => toast(e.message, 'error')); }

  const otherIds = (c: Conversation) => c.members.filter((m) => m._id !== user?.id).map((m) => m._id);
  const canCall = active && active.type !== 'workspace' && !call;

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-full max-w-[280px] shrink-0 flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-3"><h2 className="font-semibold">Chat</h2><button className="btn-quiet !p-1.5" onClick={() => setNewChat(true)} aria-label="New conversation"><Plus size={17} /></button></div>
        <div className="flex-1 overflow-y-auto">
          {!convs ? <PageLoader /> : convs.map((c) => (
            <button key={c._id} onClick={() => { setActiveId(c._id); router.replace(`/chat?c=${c._id}`); }} className={cn('flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2.5 text-left hover:bg-surface2', activeId === c._id && 'bg-surface2')}>
              {c.type === 'dm' ? <Avatar person={c.members.find((m) => m._id !== user?.id)} size={34} online={online.has(otherIds(c)[0])} /> : <span className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-brand/15 text-brand"><Hash size={15} /></span>}
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{dmName(c, user?.id)}</span>{c.lastMessageAt && <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>}</span><span className="block truncate text-xs text-muted">{c.lastMessagePreview || 'No messages yet'}</span></span>
              {c.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-ink">{c.unread}</span>}
            </button>
          ))}
          {convs && !convs.length && <Empty title="No conversations" text="Start one from the + button." />}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-surface">
        {!active ? <div className="flex flex-1 items-center justify-center text-muted">Select a conversation</div> : (
          <>
            <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              {active.type === 'dm' ? <Avatar person={active.members.find((m) => m._id !== user?.id)} size={32} online={online.has(otherIds(active)[0])} /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand">{active.type === 'workspace' ? <UsersIcon size={15} /> : <Hash size={15} />}</span>}
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{dmName(active, user?.id)}</p>{active.type !== 'dm' && <p className="text-xs text-muted">{active.members.length || members.length} members</p>}</div>
              {canCall && <><button className="btn-quiet !p-2" aria-label="Audio call" onClick={() => startCall(otherIds(active), 'audio')}><Phone size={17} /></button><button className="btn-quiet !p-2" aria-label="Video call" onClick={() => startCall(otherIds(active), 'video')}><Video size={17} /></button></>}
            </header>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {hasMore && <p className="text-center text-xs text-muted">Showing recent messages</p>}
              {msgs.map((m, i) => {
                const mine = m.sender._id === user?.id;
                const showAvatar = i === 0 || msgs[i - 1].sender._id !== m.sender._id;
                return (
                  <div key={m._id} className={cn('group flex items-end gap-2', mine && 'flex-row-reverse')}>
                    <div className="w-7">{showAvatar && !mine && <Avatar person={m.sender} size={28} />}</div>
                    <div className={cn('max-w-[75%]', mine && 'items-end')}>
                      {showAvatar && !mine && <p className="mb-0.5 px-1 text-xs text-muted">{m.sender.name}</p>}
                      {editing?.id === m._id ? (
                        <div className="flex items-center gap-1.5"><input className="input !py-1.5" value={editing.body} onChange={(e) => setEditing({ id: m._id, body: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} autoFocus /><button className="btn-quiet !p-1.5" onClick={saveEdit} aria-label="Save"><Check size={14} /></button><button className="btn-quiet !p-1.5" onClick={() => setEditing(null)} aria-label="Cancel"><X size={14} /></button></div>
                      ) : (
                        <div className={cn('relative rounded-2xl px-3.5 py-2 text-sm', m.deleted ? 'italic text-muted' : mine ? 'bg-brand text-brand-ink' : 'bg-surface2')}>
                          {m.deleted ? 'Message deleted' : <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                          {mine && !m.deleted && <span className="mt-0.5 block text-right text-[10px] opacity-70">{fmtTime(m.createdAt)}{m.editedAt && ' - edited'}</span>}
                        </div>
                      )}
                      {mine && !m.deleted && editing?.id !== m._id && (
                        <div className="mt-0.5 hidden justify-end gap-2 px-1 text-xs text-muted group-hover:flex">
                          <button onClick={() => setEditing({ id: m._id, body: m.body })} className="hover:text-ink"><Pencil size={12} /></button>
                          <button onClick={() => del(m._id)} className="hover:text-danger"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="h-5 px-4 text-xs italic text-muted">{typing.length > 0 && `${typing.join(', ')} ${typing.length > 1 ? 'are' : 'is'} typing...`}</div>
            <div className="flex items-center gap-2 border-t border-line p-3">
              <input className="input" placeholder="Write a message" value={draft} maxLength={4000} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
              <button className={cn('btn-primary', !draft.trim() && 'opacity-60')} onClick={send} aria-label="Send"><Send size={16} /></button>
            </div>
          </>
        )}
      </section>
      {newChat && <NewChatModal onClose={() => setNewChat(false)} onCreated={(id) => { setNewChat(false); loadConvs(); setActiveId(id); router.replace(`/chat?c=${id}`); }} />}
    </div>
  );
}

function NewChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { members, user } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState<'dm' | 'team'>('dm');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  async function create() {
    try {
      const r = await api.post('/chat/conversations', mode === 'dm' ? { type: 'dm', userId } : { type: 'team', name, memberIds: pick });
      onCreated(r.data._id);
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  const others = members.filter((m) => m.user._id !== user?.id);
  return (
    <Modal open onClose={onClose} title="New conversation" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={mode === 'dm' ? !userId : !name.trim()} onClick={create}>Start</button></>}>
      <div className="mb-4 flex gap-2"><button className={cn('btn-ghost flex-1', mode === 'dm' && '!border-brand !text-brand')} onClick={() => setMode('dm')}>Direct message</button><button className={cn('btn-ghost flex-1', mode === 'team' && '!border-brand !text-brand')} onClick={() => setMode('team')}>Team chat</button></div>
      {mode === 'dm' ? (
        <Field label="Person"><select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Choose someone</option>{others.map((m) => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}</select></Field>
      ) : (
        <div className="space-y-4"><Field label="Name"><input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design team" /></Field><div><span className="label">Members</span><ChipPicker options={others.map((m) => ({ id: m.user._id, label: m.user.name, person: m.user }))} value={pick} onChange={setPick} /></div></div>
      )}
    </Modal>
  );
}

export default function Chat() { return <Suspense><Inner /></Suspense>; }
