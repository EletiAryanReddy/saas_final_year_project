import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

const useCloud = !!(env.cloudinary.name && env.cloudinary.key && env.cloudinary.secret);
if (useCloud) {
  cloudinary.config({ cloud_name: env.cloudinary.name, api_key: env.cloudinary.key, api_secret: env.cloudinary.secret, secure: true });
}
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export interface Stored { provider: 'cloudinary' | 'local'; url: string; publicId: string; }

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

export async function saveBuffer(buf: Buffer, name: string, workspaceId: string): Promise<Stored> {
  if (useCloud) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `collabspace/${workspaceId}`, resource_type: 'auto', use_filename: true, unique_filename: true },
        (err, res) => (err || !res ? reject(err) : resolve({ provider: 'cloudinary', url: res.secure_url, publicId: res.public_id }))
      );
      stream.end(buf);
    });
  }
  const dir = path.join(UPLOAD_DIR, workspaceId);
  await fs.promises.mkdir(dir, { recursive: true });
  const rel = `${workspaceId}/${crypto.randomBytes(8).toString('hex')}-${safeName(name)}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, rel), buf);
  return { provider: 'local', url: '', publicId: rel };
}

export async function deleteStored(item: { provider?: string; publicId?: string }) {
  if (!item.publicId) return;
  try {
    if (item.provider === 'cloudinary' && useCloud) {
      await cloudinary.uploader.destroy(item.publicId, { resource_type: 'image' });
      await cloudinary.uploader.destroy(item.publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(item.publicId, { resource_type: 'video' });
    } else if (item.provider === 'local') {
      const p = path.resolve(UPLOAD_DIR, item.publicId);
      if (p.startsWith(UPLOAD_DIR)) await fs.promises.unlink(p).catch(() => {});
    }
  } catch (e) { console.error('[storage] delete failed', e); }
}

export async function streamStored(
  item: { provider?: string; publicId?: string; url?: string; name: string; mimeType?: string },
  res: Response, inline = false
) {
  res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(item.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (item.provider === 'cloudinary' && item.url) {
    const r = await fetch(item.url);
    if (!r.ok || !r.body) return res.status(502).json({ message: 'Could not fetch file from storage' });
    return Readable.fromWeb(r.body as any).pipe(res);
  }
  const p = path.resolve(UPLOAD_DIR, item.publicId || '');
  if (!p.startsWith(UPLOAD_DIR) || !fs.existsSync(p)) return res.status(404).json({ message: 'File missing from storage' });
  fs.createReadStream(p).pipe(res);
}

/** Avatars must be publicly readable, so they are stored separately from private workspace files. */
export async function saveAvatar(buf: Buffer, mime: string, userId: string): Promise<string> {
  if (useCloud) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'collabspace/avatars', resource_type: 'image', transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }] },
          (err, r) => (err || !r ? reject(err) : resolve(r.secure_url)))
        .end(buf);
    });
  }
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mime] || 'png';
  const dir = path.join(UPLOAD_DIR, 'avatars');
  await fs.promises.mkdir(dir, { recursive: true });
  const name = `${userId}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(dir, name), buf);
  return `/api/avatars/${name}`;
}
