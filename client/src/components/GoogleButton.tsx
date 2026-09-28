'use client';
import { useEffect, useRef } from 'react';

declare global { interface Window { google?: any } }
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;
    const render = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r: any) => cb.current(r.credential) });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
    };
    if (window.google) return render();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, []);

  if (!CLIENT_ID) return null;
  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      <div ref={box} className="flex justify-center" />
    </>
  );
}
