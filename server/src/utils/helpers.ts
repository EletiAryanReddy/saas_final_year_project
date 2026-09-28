import crypto from 'crypto';
import { Types } from 'mongoose';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export const pick = <T extends Record<string, any>>(obj: T, keys: string[]) => {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
};

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isId = (v: any): v is string => typeof v === 'string' && Types.ObjectId.isValid(v);
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const otp6 = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';

export const uniq = (arr: any[]) => [...new Set(arr.filter(Boolean).map(String))];

/** Only accept plain strings from query strings (blocks ?field[$ne]=x operator injection). */
export const qs = (v: any): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export function paging(req: Request, defLimit = 25) {
  const page = Math.max(1, parseInt(qs(req.query.page) || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(qs(req.query.limit) || String(defLimit), 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export const toCsv = (rows: Record<string, any>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};
