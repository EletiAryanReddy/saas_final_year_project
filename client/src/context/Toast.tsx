'use client';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type Kind = 'ok' | 'error' | 'info';
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([]);
  const push = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const Icon = { ok: CheckCircle2, error: AlertCircle, info: Info };
  const color = { ok: 'text-ok', error: 'text-danger', info: 'text-info' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm shadow-lg">
              <I size={18} className={`mt-0.5 shrink-0 ${color[t.kind]}`} />
              <span>{t.msg}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
