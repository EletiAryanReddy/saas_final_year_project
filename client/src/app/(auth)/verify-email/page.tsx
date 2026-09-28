'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApp } from '@/context/App';
import { takeNext } from '@/lib/utils';
import { ErrorText } from '@/components/ui';
import { useToast } from '@/context/Toast';
import { Loader2 } from 'lucide-react';

export default function VerifyEmail() {
  const params = useSearchParams();
  const email = params.get('email') || '';
  const token = params.get('token');
  const router = useRouter();
  const toast = useToast();
  const { startSession } = useApp();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const tried = useRef(false);

  async function verify(body: any) {
    setBusy(true); setError('');
    try { await startSession(await api.post('/auth/verify-email', { email, ...body })); router.replace(takeNext()); }
    catch (err) { setError((err as Error).message); setDigits(Array(6).fill('')); refs.current[0]?.focus(); }
    finally { setBusy(false); }
  }

  useEffect(() => { setHint(sessionStorage.getItem('cs_devotp') || ''); }, []);
  useEffect(() => { if (token && email && !tried.current) { tried.current = true; verify({ token }); } /* eslint-disable-next-line */ }, [token, email]);

  const set = (i: number, v: string) => {
    const d = [...digits];
    v = v.replace(/\D/g, '');
    if (v.length > 1) { // paste
      v.slice(0, 6).split('').forEach((c, k) => (d[k] = c));
      setDigits(d); refs.current[Math.min(v.length, 5)]?.focus();
      if (v.length >= 6) verify({ otp: d.join('') });
      return;
    }
    d[i] = v; setDigits(d);
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (d.every(Boolean)) verify({ otp: d.join('') });
  };

  async function resend() {
    try { const r = await api.post('/auth/resend-otp', { email }); if (r.devOtp) setHint(r.devOtp); toast('A new code is on its way'); }
    catch (err) { setError((err as Error).message); }
  }

  if (!email) return <p className="text-sm text-muted">Open this page from the link in your email, or register again.</p>;
  return (
    <div>
      <h1 className="text-3xl font-semibold">Check your email</h1>
      <p className="mt-1 text-sm text-muted">We sent a 6-digit code to <b className="text-ink">{email}</b>. It expires in 10 minutes.</p>
      {token && busy && <p className="mt-6 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Verifying your link...</p>}
      <div className="mt-6 flex justify-between gap-2">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d} aria-label={`Digit ${i + 1}`}
            onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !digits[i] && i > 0 && refs.current[i - 1]?.focus()}
            className="input !px-0 h-12 w-11 text-center text-lg font-semibold" />
        ))}
      </div>
      <div className="mt-4"><ErrorText>{error}</ErrorText></div>
      {hint && <p className="mt-4 rounded-lg bg-accent/20 px-3 py-2 text-sm">Dev mode (no email server configured): your code is <b className="tracking-widest">{hint}</b></p>}
      <button className="btn-primary mt-5 w-full" disabled={busy || digits.some((d) => !d)} onClick={() => verify({ otp: digits.join('') })}>{busy && <Loader2 size={16} className="animate-spin" />}Verify email</button>
      <p className="mt-5 text-center text-sm text-muted">Did not get it? <button onClick={resend} className="font-medium text-brand hover:underline">Send a new code</button></p>
    </div>
  );
}
