import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export const notFound = (_req: Request, res: Response) => res.status(404).json({ message: 'Route not found' });

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) return res.status(err.status).json({ message: err.message, code: err.code });
  if (err instanceof ZodError)
    return res.status(400).json({ message: err.issues[0]?.message || 'Invalid input', code: 'VALIDATION', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  if (err?.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path || 'value'}` });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: Object.values<any>(err.errors)[0]?.message || 'Validation failed' });
  if (err?.code === 11000) return res.status(409).json({ message: 'That already exists', code: 'DUPLICATE' });
  if (err?.name === 'MulterError') return res.status(400).json({ message: err.message });
  console.error('[error]', err);
  res.status(500).json({ message: env.isProd ? 'Something went wrong' : String(err?.message || err) });
}
