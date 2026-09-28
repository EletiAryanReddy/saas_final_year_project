const API = process.env.API_URL || 'http://localhost:5000';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Proxy /api to the backend so the refresh-token cookie is first-party (works on Vercel + Render).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};
