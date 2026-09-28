'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Plus, Trash2, Download, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { useToast } from '@/context/Toast';
import { Avatar, ErrorText, Field, PageHeader, Tabs } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { R, Tag } from '@/lib/types';

const TABS = [{ id: 'profile', label: 'Profile' }, { id: 'notifications', label: 'Notifications' }, { id: 'tags', label: 'Tags' }, { id: 'workspace', label: 'Workspace' }, { id: 'security', label: 'Security' }] as const;

export default function Settings() {
  const { user, current, can, setUser, reload, logout } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('profile');

  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs tabs={TABS.filter((t) => t.id !== 'workspace' || can('workspace:update'))} value={tab} onChange={setTab as any} />
      <div className="mt-6 max-w-xl">
        {tab === 'profile' && user && <Profile user={user} setUser={setUser} />}
        {tab === 'notifications' && user && <Notifications user={user} setUser={setUser} />}
        {tab === 'tags' && <Tags />}
        {tab === 'workspace' && can('workspace:update') && <WorkspaceSettings />}
        {tab === 'security' && <Security onLoggedOut={async () => { await logout(); router.replace('/login'); }} />}
      </div>
    </div>
  );
}

function Profile({ user, setUser }: any) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  async function save(e: React.FormEvent) { e.preventDefault(); setError(''); try { setUser((await api.patch('/settings/profile', { name })).data); toast('Saved'); } catch (err) { setError((err as Error).message); } }
  async function avatar(f: File) {
    const form = new FormData(); form.append('avatar', f);
    try { setUser((await api.upload('/settings/avatar', form)).data); toast('Photo updated'); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function exportData() {
    const blob = await api.blob('/settings/export'); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'collabspace-export.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return (
    <div className="space-y-8">
      <form onSubmit={save} className="card space-y-4 p-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative"><Avatar person={user} size={64} /><span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40 opacity-0 group-hover:opacity-100"><Camera size={20} className="text-white" /></span></button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && avatar(e.target.files[0])} />
          <div><p className="font-medium">{user.email}</p><p className="text-xs text-muted">{user.isVerified ? 'Email verified' : 'Email not verified'}</p></div>
        </div>
        <ErrorText>{error}</ErrorText>
        <Field label="Full name"><input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <button className="btn-primary">Save profile</button>
      </form>
      <div className="card p-5"><h3 className="mb-1 font-semibold">Export your data</h3><p className="mb-3 text-sm text-muted">Download a copy of your profile, workspaces and assigned tasks.</p><button className="btn-ghost" onClick={exportData}><Download size={15} />Download JSON</button></div>
    </div>
  );
}

const N_FIELDS: [string, string][] = [['email', 'Email notifications'], ['task', 'Task updates'], ['project', 'Project updates'], ['chat', 'Chat messages'], ['meeting', 'Meetings'], ['workspace', 'Workspace changes']];
function Notifications({ user, setUser }: any) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(user.preferences);
  async function toggle(k: string) {
    const next = { ...prefs, notifications: { ...prefs.notifications, [k]: !prefs.notifications[k] } };
    setPrefs(next);
    try { setUser((await api.patch('/settings/preferences', { notifications: next.notifications })).data); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function setTheme(theme: string) {
    setPrefs({ ...prefs, theme }); try { setUser((await api.patch('/settings/preferences', { theme })).data); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="space-y-6">
      <div className="card p-5"><h3 className="mb-3 font-semibold">Theme</h3><div className="flex gap-2">{['light', 'dark', 'system'].map((t) => <button key={t} onClick={() => setTheme(t)} className={cn('btn-ghost capitalize', prefs.theme === t && '!border-brand !text-brand')}>{t}</button>)}</div></div>
      <div className="card divide-y divide-line p-0">
        {N_FIELDS.map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm"><span>{label}</span><input type="checkbox" checked={!!prefs.notifications[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-brand" /></label>
        ))}
      </div>
    </div>
  );
}

function Tags() {
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const load = () => api.get<R<Tag[]>>('/tags?limit=200').then((r) => setTags(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add() { if (!name.trim()) return; try { await api.post('/tags', { name: name.trim(), color: '#0F5A55' }); setName(''); load(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function del(id: string) { try { await api.del(`/tags/${id}`); load(); } catch (e) { toast((e as Error).message, 'error'); } }
  return (
    <div className="card p-5">
      <h3 className="mb-3 font-semibold">Tags</h3>
      <div className="mb-4 flex gap-2"><input className="input" placeholder="New tag name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="btn-primary shrink-0" onClick={add}><Plus size={15} />Add</button></div>
      <div className="flex flex-wrap gap-2">{tags.map((t) => <span key={t._id} className="chip gap-1.5 pr-1 text-white" style={{ background: t.color }}><span>{t.name}</span><button onClick={() => del(t._id)} className="rounded-full p-0.5 hover:bg-black/20" aria-label={`Delete ${t.name}`}><Trash2 size={11} /></button></span>)}{!tags.length && <p className="text-sm text-muted">No tags yet.</p>}</div>
    </div>
  );
}

function WorkspaceSettings() {
  const { current, reloadWorkspace, can } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(current?.name || '');
  const [description, setDescription] = useState(current?.description || '');
  const [allowInvites, setAllowInvites] = useState(!!current?.settings?.allowMemberInvites);
  const [confirmName, setConfirmName] = useState('');
  async function save(e: React.FormEvent) { e.preventDefault(); try { await api.patch('/workspaces/current', { name, description, settings: { allowMemberInvites: allowInvites } }); await reloadWorkspace(); toast('Saved'); } catch (e) { toast((e as Error).message, 'error'); } }
  async function del() { try { await api.del('/workspaces/current', { confirmName }); toast('Workspace deleted'); router.replace('/dashboard'); location.reload(); } catch (e) { toast((e as Error).message, 'error'); } }
  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card space-y-4 p-5">
        <Field label="Workspace name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Description"><textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowInvites} onChange={(e) => setAllowInvites(e.target.checked)} />Let members invite people</label>
        <button className="btn-primary">Save workspace</button>
      </form>
      {can('workspace:delete') && (
        <div className="card border-danger/30 p-5"><h3 className="mb-1 font-semibold text-danger">Delete workspace</h3><p className="mb-3 text-sm text-muted">This permanently deletes all projects, tasks, files and messages. Type <b>{current?.name}</b> to confirm.</p>
          <div className="flex gap-2"><input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} /><button className="btn-danger shrink-0" disabled={confirmName !== current?.name} onClick={del}>Delete</button></div>
        </div>
      )}
    </div>
  );
}

function Security({ onLoggedOut }: { onLoggedOut: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [delPw, setDelPw] = useState('');
  async function change(e: React.FormEvent) { e.preventDefault(); setError(''); try { await api.post('/auth/change-password', f); toast('Password changed. Please sign in again.'); onLoggedOut(); } catch (err) { setError((err as Error).message); } }
  async function logoutAll() { try { await api.post('/auth/logout-all'); onLoggedOut(); } catch (e) { toast((e as Error).message, 'error'); } }
  async function deleteAccount() {
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    try { await api.del('/settings/account', { password: delPw }); onLoggedOut(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  return (
    <div className="space-y-6">
      <form onSubmit={change} className="card space-y-4 p-5">
        <h3 className="font-semibold">Change password</h3><ErrorText>{error}</ErrorText>
        <Field label="Current password"><input type="password" className="input" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="New password"><input type="password" required minLength={8} className="input" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <button className="btn-primary">Change password</button>
      </form>
      <div className="card p-5"><h3 className="mb-1 font-semibold">Sessions</h3><p className="mb-3 text-sm text-muted">Sign out of CollabSpace on every device.</p><button className="btn-ghost" onClick={logoutAll}><LogOut size={15} />Sign out everywhere</button></div>
      <div className="card border-danger/30 p-5"><h3 className="mb-1 font-semibold text-danger">Delete account</h3><p className="mb-3 text-sm text-muted">This is permanent. You must first leave or transfer any workspace you own.</p>
        <div className="flex gap-2"><input type="password" placeholder="Confirm your password" className="input" value={delPw} onChange={(e) => setDelPw(e.target.value)} /><button className="btn-danger shrink-0" onClick={deleteAccount}>Delete</button></div>
      </div>
    </div>
  );
}
