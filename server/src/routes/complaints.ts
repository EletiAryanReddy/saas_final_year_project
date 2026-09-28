import { Router } from 'express';
import { z } from 'zod';
import { Complaint, Membership } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { asyncHandler, qs } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from '../models/Extras';
import { notify } from '../services/notify';
import { logActivity } from '../services/activity';
import { can } from '../config/permissions';

const router = Router();
router.use(authenticate, tenant);

/** Hides who filed an anonymous complaint from everyone except the person who filed it. */
function present(c: any, viewerId: string) {
  const o = c.toObject ? c.toObject() : c;
  const isMine = String(o.submitter?._id || o.submitter) === viewerId;
  if (o.anonymous && !isMine) return { ...o, submitter: null, notes: undefined };
  if (!isMine) return { ...o, notes: undefined }; // internal admin notes are never shown to the submitter
  return { ...o, notes: undefined, assignedTo: undefined }; // the submitter sees status + response, not internal handling detail
}

router.get('/', asyncHandler(async (req, res) => {
  const manage = can(req.tenant!.role, 'complaint:manage');
  const q: any = { workspace: req.tenant!.workspaceId };
  if (!manage) q.submitter = req.user!.id;
  const status = qs(req.query.status);
  if (status && COMPLAINT_STATUSES.includes(status as any)) q.status = status;
  const items = await Complaint.find(q).sort({ createdAt: -1 }).limit(200).populate('submitter', 'name avatar').populate('assignedTo', 'name');
  res.json({ data: items.map((c) => present(c, req.user!.id)) });
}));

router.post('/', requirePermission('complaint:create'), asyncHandler(async (req, res) => {
  const body = z.object({
    category: z.enum(COMPLAINT_CATEGORIES).default('other'),
    subject: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(8000),
    anonymous: z.boolean().default(false),
  }).parse(req.body);
  const ws = req.tenant!.workspaceId;
  const c = await Complaint.create({ workspace: ws, submitter: req.user!.id, ...body });

  const handlers = await Membership.find({ workspace: ws, role: { $in: ['owner', 'admin'] } }).select('user');
  await notify({
    workspace: ws, users: handlers.map((h) => h.user), actor: body.anonymous ? undefined : req.user!.id,
    type: 'workspace', title: 'New complaint submitted', body: body.subject, link: '/complaints', email: true,
  });
  await logActivity({ workspace: ws, actor: body.anonymous ? undefined : req.user!.id, action: 'created', entityType: 'complaint', message: 'submitted a complaint' });
  res.status(201).json({ data: present(c, req.user!.id) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const c = await Complaint.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId }).populate('submitter', 'name avatar').populate('assignedTo', 'name');
  if (!c) throw ApiError.notFound();
  const manage = can(req.tenant!.role, 'complaint:manage');
  const isMine = String(c.submitter._id || c.submitter) === req.user!.id;
  if (!manage && !isMine) throw ApiError.forbidden('You can only view your own complaints');
  res.json({ data: present(c, req.user!.id) });
}));

router.patch('/:id', requirePermission('complaint:manage'), asyncHandler(async (req, res) => {
  const body = z.object({
    status: z.enum(COMPLAINT_STATUSES).optional(),
    adminResponse: z.string().max(4000).optional(),
    assignedTo: z.string().nullable().optional(),
    internalNote: z.string().trim().min(1).max(2000).optional(),
  }).parse(req.body);
  const ws = req.tenant!.workspaceId;
  const c = await Complaint.findOne({ _id: req.params.id, workspace: ws });
  if (!c) throw ApiError.notFound();

  if (body.assignedTo !== undefined) {
    if (body.assignedTo && !(await Membership.exists({ workspace: ws, user: body.assignedTo }))) throw ApiError.badRequest('That person is not a member of this workspace');
    c.assignedTo = (body.assignedTo || undefined) as any;
  }
  const statusChanged = body.status && body.status !== c.status;
  const responseChanged = body.adminResponse !== undefined && body.adminResponse !== c.adminResponse;
  if (body.status) { c.status = body.status; if (['resolved', 'dismissed'].includes(body.status)) c.resolvedAt = new Date(); else c.resolvedAt = undefined; }
  if (body.adminResponse !== undefined) c.adminResponse = body.adminResponse;
  if (body.internalNote) c.notes.push({ body: body.internalNote, by: req.user!.id as any, at: new Date() } as any);
  await c.save();

  if (statusChanged || responseChanged) {
    await notify({
      workspace: ws, users: [c.submitter], actor: req.user!.id, type: 'workspace',
      title: statusChanged ? `Your complaint is now "${c.status.replace('_', ' ')}"` : 'Your complaint received a response',
      body: c.adminResponse || undefined, link: '/complaints',
    });
  }
  const full = await Complaint.findById(c._id).populate('submitter', 'name avatar').populate('assignedTo', 'name');
  res.json({ data: present(full, req.user!.id) });
}));

router.delete('/:id', requirePermission('complaint:manage'), asyncHandler(async (req, res) => {
  const c = await Complaint.findOneAndDelete({ _id: req.params.id, workspace: req.tenant!.workspaceId });
  if (!c) throw ApiError.notFound();
  res.json({ message: 'Deleted' });
}));

export default router;
