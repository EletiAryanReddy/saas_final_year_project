import { Router } from 'express';
import { Project, Task, WikiPage, FileItem } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant } from '../middleware/tenant';
import { asyncHandler, qs, escapeRegex } from '../utils/helpers';

const router = Router();
router.use(authenticate, tenant);

router.get('/', asyncHandler(async (req, res) => {
  const s = qs(req.query.q);
  if (!s || s.length < 2) return res.json({ data: { projects: [], tasks: [], wiki: [], files: [] } });
  const ws = req.tenant!.workspaceId;
  const rx = { $regex: escapeRegex(s), $options: 'i' };
  const [projects, tasks, wiki, files] = await Promise.all([
    Project.find({ workspace: ws, name: rx }).limit(5).select('name color status'),
    Task.find({ workspace: ws, title: rx }).limit(6).select('title project priority completedAt').populate('project', 'name'),
    WikiPage.find({ workspace: ws, $or: [{ title: rx }, { content: rx }] }).limit(5).select('title icon'),
    FileItem.find({ workspace: ws, name: rx }).limit(5).select('name kind parent'),
  ]);
  res.json({ data: { projects, tasks, wiki, files } });
}));

export default router;
