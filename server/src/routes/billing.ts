import { Router } from 'express';
import { z } from 'zod';
import { Workspace } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { asyncHandler } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { PLANS, PlanId } from '../config/plans';
import { getUsage } from '../services/plans';
import { createCheckout } from '../services/payments';
import { logActivity } from '../services/activity';
import { toWorkspace } from '../services/realtime';

const router = Router();
router.use(authenticate, tenant);

router.get('/', requirePermission('billing:read'), asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.tenant!.workspaceId);
  if (!ws) throw ApiError.notFound();
  const plan = PLANS[ws.plan as PlanId];
  res.json({ data: { plan, subscription: ws.subscription, usage: await getUsage(String(ws._id)), plans: Object.values(PLANS) } });
}));

async function changePlan(req: any, planId: PlanId) {
  const ws = await Workspace.findById(req.tenant.workspaceId);
  if (!ws) throw ApiError.notFound();
  if (ws.plan === planId) throw ApiError.badRequest(`You are already on the ${PLANS[planId].name} plan`);
  const target = PLANS[planId];
  const u = await getUsage(String(ws._id));
  const problems: string[] = [];
  if (u.members > target.limits.members) problems.push(`${u.members} members (limit ${target.limits.members})`);
  if (u.projects > target.limits.projects) problems.push(`${u.projects} projects (limit ${target.limits.projects})`);
  if (u.storageMB > target.limits.storageMB) problems.push(`${u.storageMB} MB storage (limit ${target.limits.storageMB} MB)`);
  if (problems.length) throw ApiError.conflict(`You are using more than the ${target.name} plan allows: ${problems.join(', ')}. Remove some first.`, 'OVER_LIMIT');

  const checkout = await createCheckout(String(ws._id), planId);
  if (!checkout.activate) return { checkout };
  ws.plan = planId;
  ws.set('subscription', { status: 'active', currentPeriodEnd: planId === 'free' ? undefined : new Date(Date.now() + 30 * 864e5) });
  await ws.save();
  await logActivity({ workspace: String(ws._id), actor: req.user.id, action: 'updated', entityType: 'workspace', message: `changed the plan to ${target.name}` });
  toWorkspace(String(ws._id), 'workspace:updated', ws.toObject());
  return { checkout, workspace: ws };
}

router.post('/checkout', requirePermission('billing:manage'), asyncHandler(async (req, res) => {
  const { plan } = z.object({ plan: z.enum(['free', 'pro', 'business']) }).parse(req.body);
  res.json({ data: await changePlan(req, plan) });
}));

router.post('/cancel', requirePermission('billing:manage'), asyncHandler(async (req, res) => {
  res.json({ data: await changePlan(req, 'free') });
}));

export default router;
