'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ErrorText } from '@/components/ui';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/auth/forgot-password', { email }); setSent(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      {sent ? (
        <div className="mt-4 space-y-4"><p className="text-sm text-muted">If an account exists for <b className="text-ink">{email}</b>, a reset link is on its way. It works for one hour.</p><Link href="/login" className="btn-ghost w-full">Back to sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-muted">Enter your email and we will send you a link to choose a new password.</p>
          <ErrorText>{error}</ErrorText>
          <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn-primary w-full" disabled={busy}>Send reset link</button>
          <Link href="/login" className="block text-center text-sm text-muted hover:text-ink">Back to sign in</Link>
        </form>
      )}
    </div>
  );
}
