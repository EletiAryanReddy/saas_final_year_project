import { Router } from 'express';
import { Notification } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant } from '../middleware/tenant';
import { asyncHandler, qs } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';

const router = Router();
router.use(authenticate, tenant);

const mine = (req: any) => ({ workspace: req.tenant.workspaceId, user: req.user.id });

router.get('/', asyncHandler(async (req, res) => {
  const q: any = mine(req);
  if (qs(req.query.unread) === '1') q.read = false;
  if (qs(req.query.type)) q.type = qs(req.query.type);
  const limit = Math.min(100, parseInt(qs(req.query.limit) || '30', 10) || 30);
  const [data, unread] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1 }).limit(limit).populate('actor', 'name avatar'),
    Notification.countDocuments({ ...mine(req), read: false }),
  ]);
  res.json({ data, unread });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ ...mine(req), read: false }, { read: true });
  res.json({ message: 'ok' });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, ...mine(req) }, { read: true }, { new: true });
  if (!n) throw ApiError.notFound();
  res.json({ data: n });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await Notification.deleteOne({ _id: req.params.id, ...mine(req) });
  res.json({ message: 'Deleted' });
}));

export default router;
