import 'dotenv/config';

// Render sets RENDER=true automatically, so hosted deployments are always treated as production
// (missing variables fail loudly instead of silently falling back to localhost defaults).
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

function get(key: string, devDefault?: string): string {
  const v = process.env[key];
  if (v) return v;
  if (!isProd && devDefault !== undefined) return devDefault;
  if (devDefault === '') return '';
  const prefix = key.slice(0, 5).toUpperCase();
  const similar = Object.keys(process.env).filter((k) => k.toUpperCase().includes(prefix) || k.trim() !== k);
  throw new Error(
    `Missing required environment variable: ${key}. ` +
    (similar.length ? `Similar names found: ${similar.map((k) => JSON.stringify(k)).join(', ')}` : 'No similar variable names exist on this service.')
  );
}

export const env = {
  isProd,
  port: Number(process.env.PORT || 5000),
  mongoUri: get('MONGODB_URI', 'mongodb://127.0.0.1:27017/saas_db'),
  clientUrl: get('CLIENT_URL', 'http://localhost:3000'),
  accessSecret: get('JWT_ACCESS_SECRET', 'dev-access-secret'),
  refreshSecret: get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  googleClientId: get('GOOGLE_CLIENT_ID', ''),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CollabSpace <no-reply@collabspace.app>',
  },
  cloudinary: {
    name: process.env.CLOUDINARY_CLOUD_NAME || '',
    key: process.env.CLOUDINARY_API_KEY || '',
    secret: process.env.CLOUDINARY_API_SECRET || '',
  },
  webrtc: {
    stun: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()),
    turnUrl: (process.env.TURN_URL || '').split(',').map((s) => s.trim()).filter(Boolean),
    turnUser: process.env.TURN_USERNAME || '',
    turnCred: process.env.TURN_CREDENTIAL || '',
    maxMeshPeers: Number(process.env.MAX_MESH_PEERS || 6),
  },
  paymentMode: process.env.PAYMENT_MODE || 'mock',
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-sonnet-5',
  },
};
