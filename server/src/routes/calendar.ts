import { Router } from 'express';
import { CalendarEvent, Task, Project } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler, qs } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { assertMembers } from '../services/tenantChecks';
import { notify } from '../services/notify';

const router = Router();
router.use(authenticate, tenant);

const checkDates = (d: any, cur?: any) => {
  const start = new Date(d.start ?? cur?.start), end = new Date(d.end ?? cur?.end);
  if (isNaN(+start) || isNaN(+end)) throw ApiError.badRequest('Enter a valid start and end');
  if (end < start) throw ApiError.badRequest('The event cannot end before it starts');
};

const crud = tenantCrud({
  Model: CalendarEvent, perm: 'event', emit: 'event',
  fields: ['title', 'description', 'start', 'end', 'allDay', 'location', 'color', 'attendees', 'project'],
  searchFields: ['title', 'description'],
  sort: { start: 1 },
  populate: [{ path: 'attendees', select: 'name avatar' }],
  scope: (req) => {
    if (req.params.id) return {};
    const from = qs(req.query.from), to = qs(req.query.to);
    return from && to ? { start: { $lt: new Date(to) }, end: { $gt: new Date(from) } } : {};
  },
  beforeCreate: async (req, data) => { checkDates(data); await assertMembers(req.tenant!.workspaceId, data.attendees); },
  beforeUpdate: async (req, doc, data) => { checkDates(data, doc); await assertMembers(req.tenant!.workspaceId, data.attendees); },
  afterCreate: async (req, doc) => {
    await notify({ workspace: req.tenant!.workspaceId, users: doc.attendees.map((a: any) => a._id), actor: req.user!.id, type: 'meeting', title: `Invited to "${doc.title}"`, body: new Date(doc.start).toLocaleString(), link: '/calendar' });
  },
});

router.get('/events', requirePermission('event:read'), crud.list);
router.post('/events', requirePermission('event:create'), crud.create);
router.get('/events/:id', requirePermission('event:read'), crud.get);
router.patch('/events/:id', requirePermission('event:update'), crud.update);
router.delete('/events/:id', crud.remove);

/** Everything that belongs on the calendar for a date range: events, meetings, task deadlines, project deadlines. */
router.get('/', requirePermission('event:read'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const from = new Date(qs(req.query.from) || Date.now() - 31 * 864e5);
  const to = new Date(qs(req.query.to) || Date.now() + 31 * 864e5);
  if (isNaN(+from) || isNaN(+to)) throw ApiError.badRequest('Invalid date range');
  const [events, taskDeadlines, projectDeadlines] = await Promise.all([
    CalendarEvent.find({ workspace: ws, start: { $lt: to }, end: { $gt: from } }).sort({ start: 1 }).populate('attendees', 'name avatar'),
    Task.find({ workspace: ws, dueDate: { $gte: from, $lte: to } }).select('title dueDate project priority completedAt assignees').populate('project', 'name color'),
    Project.find({ workspace: ws, deadline: { $gte: from, $lte: to }, status: { $ne: 'archived' } }).select('name deadline color status'),
  ]);
  res.json({ data: { events, taskDeadlines, projectDeadlines } });
}));

export default router;
