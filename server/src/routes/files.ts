import { Router, Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { FileItem } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { asyncHandler, qs, escapeRegex, isId } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertWithinLimit } from '../services/plans';
import { saveBuffer, deleteStored, streamStored } from '../utils/storage';
import { logActivity } from '../services/activity';
import { toWorkspace } from '../services/realtime';
import { can } from '../config/permissions';

const router = Router();
router.use(authenticate, tenant);

const MAX_MB = 25;
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|sh|ps1|vbs|jar|dll)$/i;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 } });
const fixName = (n: string) => Buffer.from(n, 'latin1').toString('utf8');

async function assertFolder(req: Request, id: any) {
  if (id === null || id === undefined || id === '' || id === 'root') return null;
  if (!isId(id)) throw ApiError.badRequest('Invalid folder');
  const f = await FileItem.findOne({ _id: id, workspace: req.tenant!.workspaceId, kind: 'folder' });
  if (!f) throw ApiError.notFound('Folder not found');
  return f;
}

async function breadcrumbs(ws: string, folder: any) {
  const trail: { _id: string; name: string }[] = [];
  let cur = folder;
  for (let i = 0; cur && i < 20; i++) {
    trail.unshift({ _id: String(cur._id), name: cur.name });
    cur = cur.parent ? await FileItem.findOne({ _id: cur.parent, workspace: ws }).select('name parent') : null;
  }
  return trail;
}

router.get('/', requirePermission('file:read'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const q: any = { workspace: ws };
  const s = qs(req.query.q), project = qs(req.query.project), parent = qs(req.query.parent);
  if (project) q.project = project;
  if (s) q.name = { $regex: escapeRegex(s), $options: 'i' };
  else q.parent = parent && parent !== 'root' ? parent : null;
  const items = await FileItem.find(q).sort({ kind: -1, name: 1 }).populate('createdBy', 'name');
  const folder = parent && parent !== 'root' && !s ? await assertFolder(req, parent) : null;
  res.json({ data: items, breadcrumbs: folder ? await breadcrumbs(ws, folder) : [] });
}));

router.post('/folder', requirePermission('file:create'), asyncHandler(async (req, res) => {
  const { name, parent, project } = z.object({ name: z.string().trim().min(1).max(100), parent: z.string().nullable().optional(), project: z.string().optional() }).parse(req.body);
  const p = await assertFolder(req, parent);
  const doc = await FileItem.create({ workspace: req.tenant!.workspaceId, kind: 'folder', name, parent: p?._id ?? null, project, createdBy: req.user!.id });
  toWorkspace(req.tenant!.workspaceId, 'file:created', doc);
  res.status(201).json({ data: doc });
}));

router.post('/upload', requirePermission('file:create'), upload.array('files', 10), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) throw ApiError.badRequest('Choose at least one file');
  const parent = await assertFolder(req, qs(req.body.parent));
  const project = isId(req.body.project) ? req.body.project : undefined;
  const created = [];
  for (const f of files) {
    const name = fixName(f.originalname);
    if (BLOCKED.test(name)) throw ApiError.badRequest(`"${name}" is an executable file type and cannot be uploaded`);
    await assertWithinLimit(ws, 'storage', f.size);
    const stored = await saveBuffer(f.buffer, name, ws);
    const doc = await FileItem.create({ workspace: ws, kind: 'file', name, parent: parent?._id ?? null, project, mimeType: f.mimetype, size: f.size, ...stored, createdBy: req.user!.id });
    created.push(doc);
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'created', entityType: 'file', entityId: doc._id, project, message: `uploaded "${name}"` });
  }
  created.forEach((d) => toWorkspace(ws, 'file:created', d));
  res.status(201).json({ data: created });
}));

router.patch('/:id', requirePermission('file:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const body = z.object({ name: z.string().trim().min(1).max(200).optional(), parent: z.string().nullable().optional(), project: z.string().nullable().optional() }).parse(req.body);
  const item = await FileItem.findOne({ _id: req.params.id, workspace: ws });
  if (!item) throw ApiError.notFound();
  if (body.name) item.name = body.name;
  if (body.project !== undefined) item.set('project', body.project || undefined);
  if (body.parent !== undefined) {
    const target = await assertFolder(req, body.parent);
    // walk up from the destination: moving a folder into itself/its descendants would create a cycle
    let cur: any = target;
    for (let i = 0; cur && i < 50; i++) {
      if (String(cur._id) === String(item._id)) throw ApiError.badRequest('A folder cannot be moved into itself');
      cur = cur.parent ? await FileItem.findOne({ _id: cur.parent, workspace: ws }).select('parent') : null;
    }
    item.set('parent', target?._id ?? null);
  }
  await item.save();
  toWorkspace(ws, 'file:updated', item);
  res.json({ data: item });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const item = await FileItem.findOne({ _id: req.params.id, workspace: ws });
  if (!item) throw ApiError.notFound();
  const own = String(item.createdBy) === req.user!.id;
  if (!can(req.tenant!.role, 'file:delete') && !(own && can(req.tenant!.role, 'file:delete:own'))) throw ApiError.forbidden('Your role cannot delete this item');

  // collect the item and every descendant
  const all: any[] = [item];
  let frontier = [item];
  for (let depth = 0; depth < 30 && frontier.length; depth++) {
    const kids: any[] = await FileItem.find({ workspace: ws, parent: { $in: frontier.filter((f) => f.kind === 'folder').map((f) => f._id) } });
    all.push(...kids);
    frontier = kids;
  }
  await Promise.all(all.filter((f) => f.kind === 'file').map((f) => deleteStored(f)));
  await FileItem.deleteMany({ workspace: ws, _id: { $in: all.map((f) => f._id) } });
  toWorkspace(ws, 'file:deleted', { _id: String(item._id) });
  res.json({ data: { _id: String(item._id), removed: all.length } });
}));

const serve = (inline: boolean) => asyncHandler(async (req, res) => {
  const item = await FileItem.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId, kind: 'file' });
  if (!item) throw ApiError.notFound();
  await streamStored(item as any, res, inline);
});
router.get('/:id/download', requirePermission('file:read'), serve(false));
router.get('/:id/view', requirePermission('file:read'), serve(true));

export default router;
