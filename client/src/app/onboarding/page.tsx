'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { ErrorText, PageLoader } from '@/components/ui';

function Inner() {
  const { user, ready, workspaces, reload } = useApp();
  const router = useRouter();
  const isNew = useSearchParams().get('new') === '1';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => { if (ready && user && workspaces.length && !isNew) router.replace('/dashboard'); }, [ready, user, workspaces.length, isNew, router]);
  if (!ready || !user) return <PageLoader />;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/workspaces', { name, description: description || undefined }); await reload(r.data.workspace._id); router.replace('/dashboard'); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-8">
        <p className="font-display text-lg font-bold text-brand">CollabSpace</p>
        <div><h1 className="text-2xl font-semibold">{isNew ? 'Create another workspace' : `Welcome, ${user.name.split(' ')[0]}`}</h1><p className="mt-1 text-sm text-muted">A workspace is your team's private home. Its projects, chats and files are only visible to its members.</p></div>
        <ErrorText>{error}</ErrorText>
        <div><label className="label" htmlFor="n">Workspace name</label><input id="n" required minLength={2} maxLength={60} autoFocus className="input" placeholder="Acme Studio" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="d">What does your team do? (optional)</label><input id="d" maxLength={300} className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex gap-2">
          {isNew && <button type="button" className="btn-ghost flex-1" onClick={() => router.back()}>Cancel</button>}
          <button className="btn-primary flex-1" disabled={busy}>Create workspace</button>
        </div>
      </form>
    </div>
  );
}
export default function Onboarding() { return <Suspense><Inner /></Suspense>; }
