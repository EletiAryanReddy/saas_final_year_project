import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { UPLOAD_DIR } from './utils/storage';
import { notFound, errorHandler } from './middleware/error';

import auth from './routes/auth';
import workspaces, { publicInviteRouter } from './routes/workspaces';
import projects from './routes/projects';
import tasks from './routes/tasks';
import tags from './routes/tags';
import chat from './routes/chat';
import calendar from './routes/calendar';
import meetings from './routes/meetings';
import calls from './routes/calls';
import files from './routes/files';
import wiki from './routes/wiki';
import whiteboards from './routes/whiteboards';
import notifications from './routes/notifications';
import analytics, { dashboardRouter } from './routes/analytics';
import billing from './routes/billing';
import settings from './routes/settings';
import search from './routes/search';
import notes from './routes/notes';
import complaints from './routes/complaints';
import ai from './routes/ai';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

// avatars are the only publicly readable uploads; workspace files are streamed through authenticated routes
app.use('/api/avatars', express.static(path.join(UPLOAD_DIR, 'avatars'), { maxAge: '7d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date(), features: ['ai', 'complaints', 'notes', 'announcements'], turnConfigured: env.webrtc.turnUrl.length > 0, clientUrl: env.clientUrl }));

app.use('/api/auth', auth);
app.use('/api/invites', publicInviteRouter);
app.use('/api/workspaces', workspaces);
app.use('/api/projects', projects);
app.use('/api/tasks', tasks);
app.use('/api/tags', tags);
app.use('/api/chat', chat);
app.use('/api/calendar', calendar);
app.use('/api/meetings', meetings);
app.use('/api/calls', calls);
app.use('/api/files', files);
app.use('/api/wiki', wiki);
app.use('/api/whiteboards', whiteboards);
app.use('/api/notifications', notifications);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/analytics', analytics);
app.use('/api/billing', billing);
app.use('/api/settings', settings);
app.use('/api/search', search);
app.use('/api/notes', notes);
app.use('/api/complaints', complaints);
app.use('/api/ai', ai);

// Payment provider webhook placeholder (Stripe / Razorpay). Verify the provider signature here, then update Workspace.plan.
app.post('/api/webhooks/billing', (_req, res) => res.status(501).json({ message: 'Connect a payment provider in services/payments.ts' }));

app.use(notFound);
app.use(errorHandler);
