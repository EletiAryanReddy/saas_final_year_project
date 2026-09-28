import { Router } from 'express';
import { Types } from 'mongoose';
import { Task, Project, Activity, Membership, Notification, User } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { asyncHandler, qs, toCsv } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { notDone, isOverdue } from '../utils/agg';

const day = (d: Date) => d.toISOString().slice(0, 10);
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => day(new Date(Date.now() - (n - 1 - i) * 864e5)));
const fill = (days: string[], rows: { _id: string; n: number }[]) => {
  const m = new Map(rows.map((r) => [r._id, r.n]));
  return days.map((d) => ({ date: d, count: m.get(d) || 0 }));
};
const perDay = (field: string, match: any) => [
  { $match: match },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } }, n: { $sum: 1 } } },
];

/* ---------------- dashboard ---------------- */
export const dashboardRouter = Router();
dashboardRouter.use(authenticate, tenant);

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const ws = new Types.ObjectId(req.tenant!.workspaceId);
  const me = new Types.ObjectId(req.user!.id);
  const now = new Date();
  const weekAgo = new Date(Date.now() - 6 * 864e5); weekAgo.setUTCHours(0, 0, 0, 0);

  const [projectsByStatus, taskTotals, myOpen, dueSoon, activity, members, unread, completed] = await Promise.all([
    Project.aggregate([{ $match: { workspace: ws } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { workspace: ws } }, { $group: { _id: null, total: { $sum: 1 }, done: { $sum: { $cond: [notDone, 0, 1] } }, overdue: { $sum: { $cond: [isOverdue(now), 1, 0] } } } }]),
    Task.countDocuments({ workspace: ws, assignees: me, completedAt: null }),
    Task.find({ workspace: ws, assignees: me, completedAt: null, dueDate: { $ne: null } }).sort({ dueDate: 1 }).limit(6).select('title dueDate priority project').populate('project', 'name color'),
    Activity.find({ workspace: ws }).sort({ createdAt: -1 }).limit(12).populate('actor', 'name avatar'),
    Membership.find({ workspace: ws }).limit(12).populate('user', 'name avatar email'),
    Notification.countDocuments({ workspace: ws, user: me, read: false }),
    Task.aggregate(perDay('completedAt', { workspace: ws, completedAt: { $gte: weekAgo } })),
  ]);
  const t = taskTotals[0] || { total: 0, done: 0, overdue: 0 };
  res.json({
    data: {
      projects: Object.fromEntries(projectsByStatus.map((p) => [p._id, p.n])),
      tasks: { total: t.total, done: t.done, open: t.total - t.done, overdue: t.overdue, mine: myOpen },
      dueSoon, recentActivity: activity, unreadNotifications: unread,
      team: members.filter((m) => m.user).map((m: any) => ({ role: m.role, user: m.user })),
      productivity: fill(lastDays(7), completed),
    },
  });
}));

/* ---------------- analytics ---------------- */
const router = Router();
router.use(authenticate, tenant, requirePermission('analytics:read'));

router.get('/', asyncHandler(async (req, res) => {
  const ws = new Types.ObjectId(req.tenant!.workspaceId);
  const days = Math.min(90, Math.max(7, parseInt(qs(req.query.days) || '30', 10) || 30));
  const since = new Date(Date.now() - (days - 1) * 864e5); since.setUTCHours(0, 0, 0, 0);
  const now = new Date();

  const [summary, byPriority, perProject, perMember, created, completed, avg] = await Promise.all([
    Task.aggregate([{ $match: { workspace: ws } }, { $group: { _id: null, total: { $sum: 1 }, done: { $sum: { $cond: [notDone, 0, 1] } }, overdue: { $sum: { $cond: [isOverdue(now), 1, 0] } } } }]),
    Task.aggregate([{ $match: { workspace: ws, completedAt: null } }, { $group: { _id: '$priority', n: { $sum: 1 } } }]),
    Task.aggregate([{ $match: { workspace: ws } }, { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [notDone, 0, 1] } }, overdue: { $sum: { $cond: [isOverdue(now), 1, 0] } } } }, { $sort: { total: -1 } }, { $limit: 12 }]),
    Task.aggregate([{ $match: { workspace: ws } }, { $unwind: '$assignees' }, { $group: { _id: '$assignees', assigned: { $sum: 1 }, completed: { $sum: { $cond: [notDone, 0, 1] } } } }, { $sort: { assigned: -1 } }, { $limit: 20 }]),
    Task.aggregate(perDay('createdAt', { workspace: ws, createdAt: { $gte: since } })),
    Task.aggregate(perDay('completedAt', { workspace: ws, completedAt: { $gte: since } })),
    Task.aggregate([{ $match: { workspace: ws, completedAt: { $ne: null } } }, { $group: { _id: null, ms: { $avg: { $subtract: ['$completedAt', '$createdAt'] } } } }]),
  ]);

  const [projects, users] = await Promise.all([
    Project.find({ _id: { $in: perProject.map((p) => p._id) } }).select('name color'),
    User.find({ _id: { $in: perMember.map((m) => m._id) } }).select('name avatar'),
  ]);
  const pn = new Map(projects.map((p) => [String(p._id), p]));
  const un = new Map(users.map((u) => [String(u._id), u]));
  const s = summary[0] || { total: 0, done: 0, overdue: 0 };
  const range = lastDays(days);

  res.json({
    data: {
      days,
      summary: { total: s.total, done: s.done, open: s.total - s.done, overdue: s.overdue, completionRate: s.total ? Math.round((s.done / s.total) * 100) : 0, avgCompletionHours: avg[0] ? Math.round((avg[0].ms / 36e5) * 10) / 10 : 0 },
      byPriority: Object.fromEntries(byPriority.map((p) => [p._id, p.n])),
      perProject: perProject.map((p) => ({ project: pn.get(String(p._id)) || { name: 'Deleted project' }, total: p.total, done: p.done, overdue: p.overdue })),
      perMember: perMember.map((m) => ({ user: un.get(String(m._id)) || { name: 'Former member' }, assigned: m.assigned, completed: m.completed })),
      timeline: { created: fill(range, created), completed: fill(range, completed) },
    },
  });
}));

router.get('/activity', asyncHandler(async (req, res) => {
  const days = Math.min(90, parseInt(qs(req.query.days) || '14', 10) || 14);
  const data = await Activity.find({ workspace: req.tenant!.workspaceId, createdAt: { $gte: new Date(Date.now() - days * 864e5) } }).sort({ createdAt: -1 }).limit(300).populate('actor', 'name');
  res.json({ data });
}));

router.get('/export', asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const type = qs(req.query.type) || 'tasks';
  let rows: Record<string, any>[] = [];
  if (type === 'tasks') {
    const tasks = await Task.find({ workspace: ws }).populate('project', 'name').populate('assignees', 'name');
    rows = tasks.map((t: any) => ({ Title: t.title, Project: t.project?.name, Status: t.status, Priority: t.priority, Assignees: t.assignees.map((a: any) => a.name).join('; '), Due: t.dueDate, Created: t.createdAt, Completed: t.completedAt }));
  } else if (type === 'projects') {
    const ps = await Project.find({ workspace: ws }).populate('members', 'name');
    const counts = await Task.aggregate([{ $match: { workspace: new Types.ObjectId(ws) } }, { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [notDone, 0, 1] } } } }]);
    const cm = new Map<string, any>(counts.map((c: any) => [String(c._id), c]));
    rows = ps.map((p: any) => ({ Name: p.name, Status: p.status, Deadline: p.deadline, Members: p.members.map((m: any) => m.name).join('; '), Tasks: cm.get(String(p._id))?.total || 0, Completed: cm.get(String(p._id))?.done || 0 }));
  } else if (type === 'activity') {
    const acts = await Activity.find({ workspace: ws }).sort({ createdAt: -1 }).limit(2000).populate('actor', 'name');
    rows = acts.map((a: any) => ({ When: a.createdAt, Who: a.actor?.name, Action: a.action, Type: a.entityType, Details: a.message }));
  } else throw ApiError.badRequest('type must be tasks, projects or activity');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${day(new Date())}.csv"`);
  res.send(rows.length ? toCsv(rows) : 'No data');
}));

export default router;
