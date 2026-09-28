import { Router } from 'express';
import { z } from 'zod';
import { AiMessage, Workspace, User } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant } from '../middleware/tenant';
import { asyncHandler } from '../utils/helpers';
import { askAssistant, aiConfigured } from '../services/ai';

const router = Router();
router.use(authenticate, tenant);

const mine = (req: any) => ({ workspace: req.tenant.workspaceId, user: req.user.id });

router.get('/status', (_req, res) => res.json({ data: { configured: aiConfigured } }));

router.get('/messages', asyncHandler(async (req, res) => {
  const data = await AiMessage.find(mine(req)).sort({ createdAt: 1 }).limit(100);
  res.json({ data });
}));

router.post('/chat', asyncHandler(async (req, res) => {
  const { message } = z.object({ message: z.string().trim().min(1).max(8000) }).parse(req.body);
  const ws = req.tenant!.workspaceId;

  const userMsg = await AiMessage.create({ workspace: ws, user: req.user!.id, role: 'user', content: message });
  const recent = await AiMessage.find(mine(req)).sort({ createdAt: -1 }).limit(20);
  const history = recent.reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const [workspace, me] = await Promise.all([Workspace.findById(ws).select('name'), User.findById(req.user!.id).select('name')]);
  const reply = await askAssistant(history, workspace?.name || 'your workspace', me?.name || 'there');
  const assistantMsg = await AiMessage.create({ workspace: ws, user: req.user!.id, role: 'assistant', content: reply });

  res.status(201).json({ data: { user: userMsg, assistant: assistantMsg } });
}));

router.delete('/messages', asyncHandler(async (req, res) => {
  await AiMessage.deleteMany(mine(req));
  res.json({ message: 'Cleared' });
}));

export default router;
