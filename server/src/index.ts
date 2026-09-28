import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { initSockets } from './sockets';

async function main() {
  await connectDB();
  const server = http.createServer(app);
  initSockets(server);
  server.listen(env.port, () => console.log(`[server] http://localhost:${env.port}  (${env.isProd ? 'production' : 'development'})`));

  const shutdown = () => { console.log('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 8000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { console.error('Fatal startup error', e); process.exit(1); });
