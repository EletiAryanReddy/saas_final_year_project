'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ErrorText } from '@/components/ui';

export default function Reset() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.post('/auth/reset-password', { token, password }); setDone(true); } catch (err) { setError((err as Error).message); }
  }
  if (!token) return <p className="text-sm text-muted">This reset link is missing its token. <Link href="/forgot-password" className="text-brand hover:underline">Request a new one</Link>.</p>;
  return (
    <div>
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      {done ? (
        <div className="mt-4 space-y-4"><p className="text-sm text-muted">Password updated. You have been signed out on every device.</p><Link href="/login" className="btn-primary w-full">Sign in</Link></div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <ErrorText>{error}</ErrorText>
          <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /><p className="mt-1 text-xs text-muted">At least 8 characters with a letter and a number.</p></div>
          <button className="btn-primary w-full">Update password</button>
        </form>
      )}
    </div>
  );
}
