import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/context/Toast';
import { AppProvider } from '@/context/App';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = { title: 'CollabSpace', description: 'Projects, chat, calls and docs for your whole team.' };

// applies the saved theme before first paint to avoid a light flash
const themeScript = `try{var t=localStorage.getItem('cs_theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <ToastProvider><AppProvider>{children}</AppProvider></ToastProvider>
      </body>
    </html>
  );
}
