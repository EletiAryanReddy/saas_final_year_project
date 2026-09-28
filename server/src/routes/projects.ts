import { Router } from 'express';
import { z } from 'zod';
import { Project, Task, Comment } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler, uniq } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertWithinLimit } from '../services/plans';
import { assertMembers, assertTags, getProject } from '../services/tenantChecks';
import { logActivity } from '../services/activity';
import { notify } from '../services/notify';
import { toWorkspace } from '../services/realtime';
import { Types } from 'mongoose';
import { notDone, isOverdue } from '../utils/agg';

const router = Router();
router.use(authenticate, tenant);

const crud = tenantCrud({
  Model: Project, perm: 'project', emit: 'project',
  fields: ['name', 'description', 'status', 'deadline', 'color', 'members', 'tags'],
  searchFields: ['name', 'description'],
  filters: ['status', 'members', 'tags'],
  populate: [{ path: 'members', select: 'name email avatar' }, { path: 'tags', select: 'name color' }],
  beforeCreate: async (req, data) => {
    const ws = req.tenant!.workspaceId;
    await assertWithinLimit(ws, 'projects');
    data.members = uniq([...(data.members || []), req.user!.id]);
    await assertMembers(ws, data.members);
    await assertTags(ws, data.tags);
  },
  beforeUpdate: async (req, _doc, data) => {
    await assertMembers(req.tenant!.workspaceId, data.members);
    await assertTags(req.tenant!.workspaceId, data.tags);
  },
  afterCreate: async (req, doc) => {
    const ws = req.tenant!.workspaceId;
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'created', entityType: 'project', entityId: doc._id, project: doc._id, message: `created project "${doc.name}"` });
    await notify({ workspace: ws, users: doc.members.map((m: any) => m._id), actor: req.user!.id, type: 'project', title: `Added to project "${doc.name}"`, link: `/projects/${doc._id}` });
  },
  afterUpdate: async (req, doc, before) => {
    const ws = req.tenant!.workspaceId;
    const prev = (before.members || []).map(String);
    const added = doc.members.map((m: any) => String(m._id)).filter((id: string) => !prev.includes(id));
    if (added.length) await notify({ workspace: ws, users: added, actor: req.user!.id, type: 'project', title: `Added to project "${doc.name}"`, link: `/projects/${doc._id}` });
    if (before.status !== doc.status) await logActivity({ workspace: ws, actor: req.user!.id, action: 'updated', entityType: 'project', entityId: doc._id, project: doc._id, message: `set project "${doc.name}" to ${doc.status.replace('_', ' ')}` });
  },
  afterDelete: async (req, doc) => {
    const ws = req.tenant!.workspaceId;
    await Comment.deleteMany({ workspace: ws, task: { $in: (await Task.find({ workspace: ws, project: doc._id }).select('_id')).map((t) => t._id) } });
    await Task.deleteMany({ workspace: ws, project: doc._id });
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'deleted', entityType: 'project', message: `deleted project "${doc.name}"` });
  },
  decorateList: async (req, docs) => {
    if (!docs.length) return docs;
    const stats: any[] = await Task.aggregate([
      { $match: { workspace: new Types.ObjectId(req.tenant!.workspaceId), project: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [notDone, 0, 1] } }, overdue: { $sum: { $cond: [isOverdue(new Date()), 1, 0] } } } },
    ]);
    const map = new Map<string, any>(stats.map((s) => [String(s._id), s]));
    return docs.map((d) => ({ ...d, stats: { total: map.get(String(d._id))?.total || 0, done: map.get(String(d._id))?.done || 0, overdue: map.get(String(d._id))?.overdue || 0 } }));
  },
});

router.get('/', requirePermission('project:read'), crud.list);
router.post('/', requirePermission('project:create'), crud.create);
router.get('/:id', requirePermission('project:read'), crud.get);
router.patch('/:id', requirePermission('project:update'), crud.update);
router.delete('/:id', crud.remove);

// Kanban: project + its tasks in one call
router.get('/:id/board', requirePermission('task:read'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const project = await Project.findOne({ _id: req.params.id, workspace: ws }).populate('members', 'name avatar email').populate('tags', 'name color');
  if (!project) throw ApiError.notFound('Project not found');
  const tasks = await Task.find({ workspace: ws, project: project._id })
    .sort({ order: 1, createdAt: 1 })
    .populate('assignees', 'name avatar')
    .populate('tags', 'name color');
  res.json({ data: { project, tasks } });
}));

// Add / rename / recolor / reorder / remove columns. Tasks in removed columns fall back to the first column.
router.put('/:id/columns', requirePermission('project:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { columns } = z.object({
    columns: z.array(z.object({
      key: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
      name: z.string().trim().min(1).max(30),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6B7C86'),
      isDone: z.boolean().default(false),
    })).min(2).max(10),
  }).parse(req.body);
  if (new Set(columns.map((c) => c.key)).size !== columns.length) throw ApiError.badRequest('Column keys must be unique');
  if (!columns.some((c) => c.isDone)) throw ApiError.badRequest('Mark one column as the "done" column');

  const project = await getProject(ws, req.params.id);
  const keys = columns.map((c) => c.key);
  project.set('columns', columns);
  await project.save();
  await Task.updateMany({ workspace: ws, project: project._id, status: { $nin: keys } }, { $set: { status: columns[0].key, completedAt: columns[0].isDone ? new Date() : null } });
  toWorkspace(ws, 'project:updated', project.toObject());
  res.json({ data: project });
}));

export default router;
