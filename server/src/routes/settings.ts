import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Membership, Workspace, Task, Notification, Comment, publicUser } from '../models';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { saveAvatar } from '../utils/storage';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

router.patch('/profile', asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2).max(60).optional() }).parse(req.body);
  const u = await User.findByIdAndUpdate(req.user!.id, body, { new: true });
  res.json({ data: publicUser(u) });
}));

router.post('/avatar', upload.single('avatar'), asyncHandler(async (req, res) => {
  const f = req.file;
  if (!f) throw ApiError.badRequest('Choose an image');
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype)) throw ApiError.badRequest('Use a PNG, JPG, WebP or GIF image');
  const url = await saveAvatar(f.buffer, f.mimetype, req.user!.id);
  const u = await User.findByIdAndUpdate(req.user!.id, { avatar: url }, { new: true });
  res.json({ data: publicUser(u) });
}));

router.patch('/preferences', asyncHandler(async (req, res) => {
  const p = z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(60).optional(),
    notifications: z.object({
      email: z.boolean(), push: z.boolean(), chat: z.boolean(), task: z.boolean(), project: z.boolean(), meeting: z.boolean(), workspace: z.boolean(),
    }).partial().optional(),
  }).parse(req.body);
  const set: any = {};
  for (const k of ['theme', 'language', 'timezone'] as const) if (p[k] !== undefined) set[`preferences.${k}`] = p[k];
  for (const [k, v] of Object.entries(p.notifications || {})) set[`preferences.notifications.${k}`] = v;
  const u = await User.findByIdAndUpdate(req.user!.id, { $set: set }, { new: true });
  res.json({ data: publicUser(u) });
}));

router.get('/export', asyncHandler(async (req, res) => {
  const id = req.user!.id;
  const [user, memberships, tasks, comments] = await Promise.all([
    User.findById(id), Membership.find({ user: id }).populate('workspace', 'name'),
    Task.find({ assignees: id }).select('title status priority dueDate createdAt'), Comment.find({ createdBy: id }).select('body createdAt'),
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="collabspace-export.json"');
  res.json({ exportedAt: new Date(), user: publicUser(user), workspaces: memberships.map((m: any) => ({ name: m.workspace?.name, role: m.role })), assignedTasks: tasks, comments });
}));

router.delete('/account', asyncHandler(async (req, res) => {
  const { password } = z.object({ password: z.string().optional() }).parse(req.body);
  const user: any = await User.findById(req.user!.id).select('+password');
  if (!user) throw ApiError.notFound();
  if (user.password && !(await bcrypt.compare(password || '', user.password))) throw ApiError.badRequest('Password is incorrect');
  if (await Workspace.exists({ owner: user._id })) throw ApiError.conflict('Transfer ownership or delete the workspaces you own before deleting your account.', 'OWNS_WORKSPACES');
  await Promise.all([
    Membership.deleteMany({ user: user._id }), Notification.deleteMany({ user: user._id }),
    Task.updateMany({ assignees: user._id }, { $pull: { assignees: user._id } }),
  ]);
  await user.deleteOne();
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Account deleted' });
}));

export default router;
