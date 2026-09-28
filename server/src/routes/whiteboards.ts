import { Router } from 'express';
import { z } from 'zod';
import { Whiteboard } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';

const router = Router();
router.use(authenticate, tenant);

const crud = tenantCrud({
  Model: Whiteboard, perm: 'whiteboard', emit: 'whiteboard',
  fields: ['name', 'project'], searchFields: ['name'], select: '-elements', sort: { updatedAt: -1 },
});

router.get('/', requirePermission('whiteboard:read'), crud.list);
router.post('/', requirePermission('whiteboard:create'), crud.create);
router.get('/:id', requirePermission('whiteboard:read'), crud.get);
router.patch('/:id', requirePermission('whiteboard:update'), crud.update);
router.delete('/:id', crud.remove);

// Whole-board save (used by "Save" and by the client when a session ends)
router.put('/:id/elements', requirePermission('whiteboard:update'), asyncHandler(async (req, res) => {
  const { elements } = z.object({ elements: z.array(z.any()).max(5000) }).parse(req.body);
  const b = await Whiteboard.findOneAndUpdate({ _id: req.params.id, workspace: req.tenant!.workspaceId }, { elements }, { new: true }).select('-elements');
  if (!b) throw ApiError.notFound();
  res.json({ data: b });
}));

export default router;
