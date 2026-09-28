'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/App';
import { SocketProvider } from '@/context/Socket';
import { CallProvider } from '@/context/Call';
import { Shell } from '@/components/Shell';
import { PageLoader } from '@/components/ui';
import { NEXT_KEY } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, workspaces, current } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) { sessionStorage.setItem(NEXT_KEY, pathname); router.replace('/login'); }
    else if (workspaces.length === 0) router.replace('/onboarding');
  }, [ready, user, workspaces.length, router, pathname]);

  if (!ready || !user || !current) return <div className="flex h-screen items-center justify-center"><PageLoader /></div>;
  return (
    <SocketProvider>
      <CallProvider>
        <Shell><Suspense fallback={<PageLoader />}>{children}</Suspense></Shell>
      </CallProvider>
    </SocketProvider>
  );
}
