'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/context/App';
import { ErrorText, PageLoader } from '@/components/ui';
import { NEXT_KEY } from '@/lib/utils';

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const { user, ready, reload } = useApp();
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/invites/${token}`).then((r) => setInfo(r.data)).catch((e) => setError(e.message));
    sessionStorage.setItem(NEXT_KEY, `/invite/${token}`);
  }, [token]);

  async function accept() {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/invites/${token}/accept`);
      sessionStorage.removeItem(NEXT_KEY);
      await reload(r.data.workspaceId);
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not accept the invitation'); }
    finally { setBusy(false); }
  }

  if (!ready) return <PageLoader />;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <p className="font-display text-lg font-bold text-brand">CollabSpace</p>
        {!info && !error && <PageLoader />}
        {error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}
        {info && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">Join {info.workspaceName}</h1>
            <p className="mt-2 text-sm text-muted">{info.invitedBy} invited <b className="text-ink">{info.email}</b> to join as {info.role}.</p>
            {user ? (
              <button className="btn-primary mt-6 w-full" disabled={busy} onClick={accept}>Accept invitation</button>
            ) : (
              <div className="mt-6 space-y-2">
                <Link href="/register" className="btn-primary w-full">Create an account</Link>
                <Link href="/login" className="btn-ghost w-full">I already have an account</Link>
                <p className="pt-1 text-xs text-muted">Use the email address the invitation was sent to.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
