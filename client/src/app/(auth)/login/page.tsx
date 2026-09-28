'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/context/App';
import { takeNext } from '@/lib/utils';
import { ErrorText } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const { user, ready, startSession } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && user) router.replace(takeNext()); }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const s = await api.post('/auth/login', { email, password });
      await startSession(s);
      router.replace(takeNext());
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        await api.post('/auth/resend-otp', { email }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function google(credential: string) {
    setError('');
    try { await startSession(await api.post('/auth/google', { credential })); router.replace(takeNext()); }
    catch (err) { setError((err as Error).message); }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back. Pick up where your team left off.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <ErrorText>{error}</ErrorText>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between"><label className="label" htmlFor="pw">Password</label><Link href="/forgot-password" className="text-xs text-brand hover:underline">Forgot password?</Link></div>
          <input id="pw" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}Sign in</button>
      </form>
      <GoogleButton onCredential={google} />
      <p className="mt-6 text-center text-sm text-muted">New here? <Link href="/register" className="font-medium text-brand hover:underline">Create an account</Link></p>
    </div>
  );
}
