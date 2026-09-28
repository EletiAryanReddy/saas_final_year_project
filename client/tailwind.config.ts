import type { Config } from 'tailwindcss';

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), surface2: c('surface-2'), ink: c('ink'), muted: c('muted'), line: c('line'),
        brand: c('brand'), 'brand-ink': c('brand-ink'), accent: c('accent'),
        danger: c('danger'), ok: c('ok'), info: c('info'), side: c('side'), 'side-ink': c('side-ink'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
