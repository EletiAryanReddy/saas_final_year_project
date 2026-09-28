import { Suspense } from 'react';

function Motif() {
  const col = (title: string, tone: string, cards: number[]) => (
    <div className="w-28 rounded-lg bg-white/8 p-2">
      <div className="mb-2 h-1.5 w-10 rounded-full" style={{ background: tone }} />
      <p className="mb-2 text-[11px] font-medium text-white/70">{title}</p>
      <div className="space-y-1.5">{cards.map((h, i) => <div key={i} className="rounded-md bg-white/90" style={{ height: h }} />)}</div>
    </div>
  );
  return <div className="flex gap-3" aria-hidden>{col('To do', '#94A3A8', [34, 26, 40])}{col('Doing', '#F2B632', [44, 30])}{col('Done', '#4ABAAA', [26, 34, 26, 30])}</div>;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-side p-12 text-side-ink lg:flex">
        <p className="font-display text-2xl font-bold text-white">CollabSpace</p>
        <div>
          <Motif />
          <h2 className="mt-10 max-w-md text-4xl font-semibold leading-tight text-white">Every project, conversation and call in one workspace.</h2>
          <p className="mt-4 max-w-md text-side-ink/80">Plan work on boards, talk in real time, and keep decisions in a wiki your whole team can find.</p>
        </div>
        <p className="text-sm text-side-ink/60">Each team gets its own private workspace.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm"><Suspense>{children}</Suspense></div>
      </div>
    </div>
  );
}
