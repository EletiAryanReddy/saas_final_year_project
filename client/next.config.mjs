// Where Vercel forwards /api requests. Reads API_URL, or falls back to NEXT_PUBLIC_API_URL,
// and tolerates a missing https:// or a trailing slash.
const raw = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API = (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');
console.log(`[next.config] /api requests will be forwarded to ${API}`);

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Proxy /api to the backend so the refresh-token cookie is first-party (works on Vercel + Render).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};