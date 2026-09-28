import { Router } from 'express';
import { z } from 'zod';
import { Task, Comment, Project } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler, qs } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertMembers, assertTags, getProject } from '../services/tenantChecks';
import { logActivity } from '../services/activity';
import { notify } from '../services/notify';
import { toWorkspace } from '../services/realtime';
import { can } from '../config/permissions';

const router = Router();
router.use(authenticate, tenant);

const columnOf = (project: any, key: string) => project.columns.find((c: any) => c.key === key);

const crud = tenantCrud({
  Model: Task, perm: 'task', emit: 'task',
  fields: ['project', 'title', 'description', 'status', 'priority', 'assignees', 'dueDate', 'tags'],
  searchFields: ['title', 'description'],
  filters: ['project', 'status', 'priority', 'assignees', 'tags', 'createdBy'],
  populate: [
    { path: 'assignees', select: 'name avatar' },
    { path: 'tags', select: 'name color' },
    { path: 'project', select: 'name color columns' },
  ],
  scope: (req) => {
    if (req.params.id) return {};
    const s: any = {};
    const before = qs(req.query.dueBefore), after = qs(req.query.dueAfter);
    if (before || after) s.dueDate = { ...(after ? { $gte: new Date(after) } : {}), ...(before ? { $lte: new Date(before) } : {}) };
    if (qs(req.query.overdue) === '1') { s.dueDate = { ...(s.dueDate || {}), $lt: new Date() }; s.completedAt = null; }
    if (qs(req.query.state) === 'open') s.completedAt = null;
    if (qs(req.query.state) === 'done') s.completedAt = { $ne: null };
    return s;
  },
  beforeCreate: async (req, data) => {
    const ws = req.tenant!.workspaceId;
    const project = await getProject(ws, data.project);
    data.status = data.status || project.columns[0].key;
    const col = columnOf(project, data.status);
    if (!col) throw ApiError.badRequest('That column does not exist on this project');
    await assertMembers(ws, data.assignees);
    await assertTags(ws, data.tags);
    const last = await Task.findOne({ workspace: ws, project: project._id, status: data.status }).sort({ order: -1 }).select('order');
    data.order = last ? last.order + 1 : 0;
    if (col.isDone) data.completedAt = new Date();
  },
  beforeUpdate: async (req, doc, data) => {
    const ws = req.tenant!.workspaceId;
    delete data.project; // moving tasks between projects is not supported
    await assertMembers(ws, data.assignees);
    await assertTags(ws, data.tags);
    if (data.status && data.status !== doc.status) {
      const project = await getProject(ws, doc.project?._id || doc.project);
      const col = columnOf(project, data.status);
      if (!col) throw ApiError.badRequest('That column does not exist on this project');
      const last = await Task.findOne({ workspace: ws, project: project._id, status: data.status }).sort({ order: -1 }).select('order');
      data.order = last ? last.order + 1 : 0;
      data.completedAt = col.isDone ? doc.completedAt || new Date() : null;
    }
  },
  afterCreate: async (req, doc) => {
    const ws = req.tenant!.workspaceId;
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'created', entityType: 'task', entityId: doc._id, project: doc.project?._id, message: `created task "${doc.title}"` });
    await notify({ workspace: ws, users: doc.assignees.map((a: any) => a._id), actor: req.user!.id, type: 'task', title: 'New task assigned to you', body: doc.title, link: `/projects/${doc.project?._id}?task=${doc._id}`, email: true });
  },
  afterUpdate: async (req, doc, before) => {
    const ws = req.tenant!.workspaceId;
    const prev = (before.assignees || []).map(String);
    const added = doc.assignees.map((a: any) => String(a._id)).filter((id: string) => !prev.includes(id));
    if (added.length) await notify({ workspace: ws, users: added, actor: req.user!.id, type: 'task', title: 'Task assigned to you', body: doc.title, link: `/projects/${doc.project?._id}?task=${doc._id}`, email: true });
    if (!before.completedAt && doc.completedAt) {
      await logActivity({ workspace: ws, actor: req.user!.id, action: 'completed', entityType: 'task', entityId: doc._id, project: doc.project?._id, message: `completed task "${doc.title}"` });
      await notify({ workspace: ws, users: [doc.createdBy], actor: req.user!.id, type: 'task', title: 'Task completed', body: doc.title, link: `/projects/${doc.project?._id}?task=${doc._id}` });
    }
  },
  afterDelete: async (req, doc) => {
    await Comment.deleteMany({ workspace: req.tenant!.workspaceId, task: doc._id });
    await logActivity({ workspace: req.tenant!.workspaceId, actor: req.user!.id, action: 'deleted', entityType: 'task', project: doc.project?._id || doc.project, message: `deleted task "${doc.title}"` });
  },
});

router.get('/', requirePermission('task:read'), crud.list);
router.post('/', requirePermission('task:create'), crud.create);

// ---- comments (declared before /:id so "comments" is never treated as an id) ----
router.delete('/comments/:commentId', asyncHandler(async (req, res) => {
  const c = await Comment.findOne({ _id: req.params.commentId, workspace: req.tenant!.workspaceId });
  if (!c) throw ApiError.notFound();
  const own = String(c.createdBy) === req.user!.id;
  if (!can(req.tenant!.role, 'comment:delete') && !(own && can(req.tenant!.role, 'comment:delete:own'))) throw ApiError.forbidden('You can only delete your own comments');
  await c.deleteOne();
  toWorkspace(req.tenant!.workspaceId, 'comment:deleted', { _id: String(c._id), task: String(c.task) });
  res.json({ data: { _id: String(c._id) } });
}));

router.get('/:id', requirePermission('task:read'), crud.get);
router.patch('/:id', requirePermission('task:update'), crud.update);
router.delete('/:id', crud.remove);

router.get('/:id/comments', requirePermission('comment:read'), asyncHandler(async (req, res) => {
  const data = await Comment.find({ workspace: req.tenant!.workspaceId, task: req.params.id }).sort({ createdAt: 1 }).populate('createdBy', 'name avatar');
  res.json({ data });
}));

router.post('/:id/comments', requirePermission('comment:create'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const task = await Task.findOne({ _id: req.params.id, workspace: ws });
  if (!task) throw ApiError.notFound('Task not found');
  const c = await (await Comment.create({ workspace: ws, task: task._id, body, createdBy: req.user!.id })).populate('createdBy', 'name avatar');
  toWorkspace(ws, 'comment:new', { task: String(task._id), comment: c });
  await logActivity({ workspace: ws, actor: req.user!.id, action: 'commented', entityType: 'task', entityId: task._id, project: task.project, message: `commented on "${task.title}"` });
  await notify({ workspace: ws, users: [...task.assignees, task.createdBy], actor: req.user!.id, type: 'task', title: 'New comment', body: `${task.title}: ${body.slice(0, 80)}`, link: `/projects/${task.project}?task=${task._id}` });
  res.status(201).json({ data: c });
}));

// ---- Kanban drag & drop: move a card to a column at an index, persisting order ----
router.post('/:id/move', requirePermission('task:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { status, index } = z.object({ status: z.string().min(1), index: z.number().int().min(0) }).parse(req.body);
  const task = await Task.findOne({ _id: req.params.id, workspace: ws });
  if (!task) throw ApiError.notFound('Task not found');
  const project = await Project.findOne({ _id: task.project, workspace: ws });
  const col = project && columnOf(project, status);
  if (!project || !col) throw ApiError.badRequest('That column does not exist on this project');

  const others = await Task.find({ workspace: ws, project: task.project, status, _id: { $ne: task._id } }).sort({ order: 1, createdAt: 1 }).select('_id');
  const ids = others.map((o) => String(o._id));
  ids.splice(Math.min(index, ids.length), 0, String(task._id));
  const wasDone = !!task.completedAt;
  const completedAt = col.isDone ? task.completedAt || new Date() : null;

  await Task.bulkWrite(ids.map((id, i) => ({
    updateOne: { filter: { _id: id, workspace: ws }, update: { $set: id === String(task._id) ? { order: i, status, completedAt } : { order: i } } },
  })));

  const items = ids.map((id, i) => ({ _id: id, order: i, status }));
  toWorkspace(ws, 'task:moved', { taskId: String(task._id), project: String(task.project), status, items, completedAt });
  if (!wasDone && col.isDone) {
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'completed', entityType: 'task', entityId: task._id, project: task.project, message: `completed task "${task.title}"` });
    await notify({ workspace: ws, users: [task.createdBy], actor: req.user!.id, type: 'task', title: 'Task completed', body: task.title, link: `/projects/${task.project}?task=${task._id}` });
  } else if (task.status !== status) {
    await logActivity({ workspace: ws, actor: req.user!.id, action: 'moved', entityType: 'task', entityId: task._id, project: task.project, message: `moved "${task.title}" to ${col.name}` });
  }
  res.json({ data: { items, completedAt } });
}));

export default router;
