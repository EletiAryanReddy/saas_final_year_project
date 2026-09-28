import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export const signAccess = (userId: string) =>
  jwt.sign({ sub: userId }, env.accessSecret, { expiresIn: '15m' });

export const signRefresh = (userId: string) =>
  jwt.sign({ sub: userId, jti: crypto.randomUUID() }, env.refreshSecret, { expiresIn: '30d' });

export const verifyAccess = (t: string) => jwt.verify(t, env.accessSecret) as { sub: string };
export const verifyRefresh = (t: string) => jwt.verify(t, env.refreshSecret) as { sub: string; jti: string };
