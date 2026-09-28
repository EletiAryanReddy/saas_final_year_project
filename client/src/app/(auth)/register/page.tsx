'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { takeNext } from '@/lib/utils';
import { ErrorText } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';
import { Loader2 } from 'lucide-react';

export default function Register() {
  const { user, ready, startSession } = useApp();
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ready && user) router.replace('/dashboard'); }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api.post('/auth/register', f);
      if (r.devOtp) sessionStorage.setItem('cs_devotp', r.devOtp);
      router.push(`/verify-email?email=${encodeURIComponent(r.email)}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function google(credential: string) {
    try { await startSession(await api.post('/auth/google', { credential })); router.replace(takeNext()); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Free for small teams. No card needed.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <ErrorText>{error}</ErrorText>
        <div><label className="label" htmlFor="name">Full name</label><input id="name" required minLength={2} autoComplete="name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="email">Work email</label><input id="email" type="email" required autoComplete="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div>
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <p className="mt-1 text-xs text-muted">At least 8 characters with a letter and a number.</p>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Create account</button>
      </form>
      <GoogleButton onCredential={google} />
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link></p>
    </div>
  );
}
