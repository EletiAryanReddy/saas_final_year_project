'use client';
import { useCallback, useEffect, useState } from 'react';
import { UserPlus, MoreVertical, Crown, Shield, X, Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useSocket } from '@/context/Socket';
import { useLive } from '@/context/Socket';
import { useToast } from '@/context/Toast';
import { Avatar, ErrorText, Field, Modal, PageHeader, PageLoader } from '@/components/ui';
import { fmtDate, cn } from '@/lib/utils';
import type { Member, R, Role } from '@/lib/types';

const ROLE_INFO: Record<Role, { label: string; icon?: any; cls: string }> = {
  owner: { label: 'Owner', icon: Crown, cls: 'bg-accent/25 text-ink' },
  admin: { label: 'Admin', icon: Shield, cls: 'bg-brand/15 text-brand' },
  member: { label: 'Member', cls: 'bg-info/15 text-info' },
  guest: { label: 'Guest', cls: 'bg-surface2 text-muted' },
};

export default function Team() {
  const { user, current, can, reloadWorkspace } = useApp();
  const { online } = useSocket();
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<R<Member[]>>('/workspaces/current/members').then((r) => setMembers(r.data)).catch(() => {});
    if (can('member:invite')) api.get('/workspaces/current/invites').then((r) => setInvites(r.data)).catch(() => {});
  }, [can]);
  useEffect(() => { load(); }, [load, current?._id]);
  useLive('member:updated', load); useLive('member:removed', load); useLive('member:joined', load);

  async function setRole(m: Member, role: Role) {
    try { await api.patch(`/workspaces/current/members/${m.membershipId}`, { role }); toast(`${m.user.name} is now ${role}`); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.user.name} from this workspace?`)) return;
    try { await api.del(`/workspaces/current/members/${m.membershipId}`); toast('Member removed'); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function transfer(m: Member) {
    if (!confirm(`Transfer ownership to ${m.user.name}? You will become an admin.`)) return;
    try { await api.post('/workspaces/current/transfer-ownership', { membershipId: m.membershipId }); toast('Ownership transferred'); await reloadWorkspace(); load(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function revoke(id: string) { try { await api.del(`/workspaces/current/invites/${id}`); load(); } catch (e) { toast((e as Error).message, 'error'); } }

  return (
    <div>
      <PageHeader title="Team" subtitle={`${members?.length || 0} member${members?.length === 1 ? '' : 's'} in ${current?.name}`} actions={<>
        {can('announcement:create') && <button className="btn-ghost" onClick={() => setAnnOpen(true)}><Megaphone size={16} />Send announcement</button>}
        {can('member:invite') && <button className="btn-primary" onClick={() => setInvOpen(true)}><UserPlus size={16} />Invite people</button>}
      </>} />
      {!members ? <PageLoader /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Member</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Joined</th><th className="w-10"></th></tr></thead>
            <tbody>
              {members.map((m) => {
                const info = ROLE_INFO[m.role]; const Icon = info.icon;
                const canManage = can('member:manage') && m.role !== 'owner' && !(m.role === 'admin' && current?.role !== 'owner');
                return (
                  <tr key={m.membershipId} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><Avatar person={m.user} size={32} online={online.has(m.user._id)} /><div className="min-w-0"><p className="truncate font-medium">{m.user.name}{m.user._id === user?.id && ' (you)'}</p><p className="truncate text-xs text-muted">{m.user.email}</p></div></div></td>
                    <td className="px-3"><span className={cn('chip', info.cls)}>{Icon && <Icon size={12} />}{info.label}</span></td>
                    <td className="px-3 text-muted">{fmtDate(m.joinedAt)}</td>
                    <td className="relative px-3">
                      {(canManage || (current?.role === 'owner' && m.role !== 'owner') || m.user._id === user?.id) && (
                        <button className="btn-quiet !p-1.5" onClick={() => setMenu(menu === m.membershipId ? null : m.membershipId)} aria-label="Member actions"><MoreVertical size={15} /></button>
                      )}
                      {menu === m.membershipId && (
                        <div className="absolute right-3 top-9 z-20 w-44 rounded-lg border border-line bg-surface py-1 shadow-xl" onMouseLeave={() => setMenu(null)}>
                          {canManage && m.role !== 'admin' && <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2" onClick={() => { setRole(m, 'admin'); setMenu(null); }}>Make admin</button>}
                          {canManage && m.role !== 'member' && <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2" onClick={() => { setRole(m, 'member'); setMenu(null); }}>Make member</button>}
                          {canManage && m.role !== 'guest' && <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2" onClick={() => { setRole(m, 'guest'); setMenu(null); }}>Make guest</button>}
                          {current?.role === 'owner' && m.role !== 'owner' && <button className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface2" onClick={() => { transfer(m); setMenu(null); }}>Transfer ownership</button>}
                          {(canManage || m.user._id === user?.id) && <button className="block w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-surface2" onClick={() => { remove(m); setMenu(null); }}>{m.user._id === user?.id ? 'Leave workspace' : 'Remove'}</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {can('member:invite') && invites.length > 0 && (
        <div className="mt-6"><h2 className="mb-2 text-sm font-semibold text-muted">Pending invitations</h2>
          <ul className="card divide-y divide-line">{invites.map((i) => <li key={i._id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span>{i.email} - <span className="capitalize text-muted">{i.role}</span></span><button className="text-muted hover:text-danger" onClick={() => revoke(i._id)} aria-label="Revoke invite"><X size={15} /></button></li>)}</ul>
        </div>
      )}
      {invOpen && <InviteModal onClose={() => setInvOpen(false)} onSent={load} />}
      {annOpen && <AnnounceModal onClose={() => setAnnOpen(false)} />}
    </div>
  );
}

function AnnounceModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.post('/workspaces/current/announce', { body }); toast('Announcement sent to everyone'); onClose(); } catch (err) { setError((err as Error).message); }
  }
  return (
    <Modal open onClose={onClose} title="Send announcement" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="ann">Send to everyone</button></>}>
      <form id="ann" onSubmit={submit} className="space-y-3">
        <ErrorText>{error}</ErrorText>
        <p className="text-sm text-muted">This shows instantly as a banner for everyone currently online, plus a notification and email for everyone else.</p>
        <Field label="Message"><textarea className="input min-h-24" required maxLength={2000} autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Office closed Friday for the long weekend" /></Field>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(''); const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const r = await api.post('/workspaces/current/invites', { email, role });
      onSent();
      if (r.devLink) { setDevLink(r.devLink); toast('Invitation created. Email sending is not configured - copy the link below.', 'info'); }
      else { toast(r.message); onClose(); }
    } catch (err) { setError((err as Error).message); }
  }
  async function copy() {
    if (!devLink) return;
    await navigator.clipboard.writeText(devLink);
    toast('Link copied');
  }
  if (devLink) {
    return (
      <Modal open onClose={onClose} title="Invitation created" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
        <p className="mb-3 text-sm text-muted">Email sending is not configured on this server, so <b className="text-ink">{email}</b> won't get an email automatically. Send them this link yourself:</p>
        <div className="flex gap-2"><input readOnly className="input select-all" value={devLink} onFocus={(e) => e.target.select()} /><button type="button" className="btn-ghost shrink-0" onClick={copy}>Copy</button></div>
        <p className="mt-3 text-xs text-muted">To send real invite emails automatically, set <code className="rounded bg-surface2 px-1 py-0.5">SMTP_HOST</code> and related variables on the server and restart it.</p>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title="Invite people" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="inv">Send invitation</button></>}>
      <form id="inv" onSubmit={submit} className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <Field label="Email"><input type="email" required autoFocus className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role"><select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="member">Member</option><option value="admin">Admin</option><option value="guest">Guest</option></select></Field>
      </form>
    </Modal>
  );
}
