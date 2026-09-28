import { Router } from 'express';
import crypto from 'crypto';
import { Meeting, CalendarEvent } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler, uniq } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertMembers } from '../services/tenantChecks';
import { notify } from '../services/notify';
import { toWorkspace } from '../services/realtime';
import { logActivity } from '../services/activity';
import { can } from '../config/permissions';

const router = Router();
router.use(authenticate, tenant);

const syncEvent = async (doc: any) => {
  const start = doc.startsAt, end = doc.endsAt || new Date(+new Date(doc.startsAt) + 3600_000);
  await CalendarEvent.findOneAndUpdate(
    { workspace: doc.workspace, meeting: doc._id },
    { workspace: doc.workspace, meeting: doc._id, type: 'meeting', title: doc.title, description: doc.description, start, end, color: '#B4530A', attendees: doc.participants.map((p: any) => p._id || p), createdBy: doc.createdBy, project: doc.project?._id || doc.project },
    { upsert: true }
  );
};

const crud = tenantCrud({
  Model: Meeting, perm: 'meeting', emit: 'meeting',
  fields: ['title', 'description', 'startsAt', 'endsAt', 'participants', 'project'],
  searchFields: ['title', 'description'],
  filters: ['status', 'participants'],
  sort: { startsAt: -1 },
  populate: [{ path: 'participants', select: 'name avatar email' }, { path: 'host', select: 'name avatar' }],
  beforeCreate: async (req, data) => {
    data.roomId = crypto.randomUUID();
    data.host = req.user!.id;
    data.participants = uniq([...(data.participants || []), req.user!.id]);
    data.endsAt = data.endsAt || new Date(+new Date(data.startsAt) + 3600_000);
    if (isNaN(+new Date(data.startsAt))) throw ApiError.badRequest('Choose a start time');
    await assertMembers(req.tenant!.workspaceId, data.participants);
  },
  beforeUpdate: async (req, _doc, data) => { await assertMembers(req.tenant!.workspaceId, data.participants); },
  afterCreate: async (req, doc) => {
    await syncEvent(doc);
    await notify({ workspace: req.tenant!.workspaceId, users: doc.participants.map((p: any) => p._id), actor: req.user!.id, type: 'meeting', title: `Meeting: ${doc.title}`, body: new Date(doc.startsAt).toLocaleString(), link: `/meetings/${doc._id}`, email: true });
  },
  afterUpdate: async (_req, doc) => { await syncEvent(doc); },
  afterDelete: async (req, doc) => { await CalendarEvent.deleteMany({ workspace: req.tenant!.workspaceId, meeting: doc._id }); },
});

router.get('/', requirePermission('meeting:read'), crud.list);
router.post('/', requirePermission('meeting:create'), crud.create);

// Start an ad-hoc meeting right now
router.post('/instant', requirePermission('meeting:create'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const participants = uniq([req.user!.id, ...(Array.isArray(req.body?.participants) ? req.body.participants : [])]);
  await assertMembers(ws, participants);
  const doc: any = await Meeting.create({
    workspace: ws, title: String(req.body?.title || 'Instant meeting').slice(0, 120), startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000),
    roomId: crypto.randomUUID(), host: req.user!.id, participants, status: 'live', createdBy: req.user!.id,
  });
  await syncEvent(doc);
  const full = await Meeting.findById(doc._id).populate('participants', 'name avatar email').populate('host', 'name avatar');
  await notify({ workspace: ws, users: participants, actor: req.user!.id, type: 'meeting', title: `${(full!.host as any).name} started a meeting`, body: doc.title, link: `/meetings/${doc._id}` });
  toWorkspace(ws, 'meeting:created', full);
  res.status(201).json({ data: full });
}));

router.get('/:id', requirePermission('meeting:read'), crud.get);
router.patch('/:id', requirePermission('meeting:update'), crud.update);
router.delete('/:id', crud.remove);

router.post('/:id/end', asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const m = await Meeting.findOne({ _id: req.params.id, workspace: ws });
  if (!m) throw ApiError.notFound('Meeting not found');
  if (String(m.host) !== req.user!.id && !can(req.tenant!.role, 'meeting:delete')) throw ApiError.forbidden('Only the host or an admin can end this meeting');
  m.status = 'ended';
  await m.save();
  toWorkspace(ws, 'meeting:updated', m.toObject());
  await logActivity({ workspace: ws, actor: req.user!.id, action: 'updated', entityType: 'meeting', entityId: m._id, message: `ended meeting "${m.title}"` });
  res.json({ data: m });
}));

export default router;
