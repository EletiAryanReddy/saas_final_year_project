import { Router } from 'express';
import { z } from 'zod';
import { Tag, Task, Project } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { toWorkspace } from '../services/realtime';

const router = Router();
router.use(authenticate, tenant);

const crud = tenantCrud({
  Model: Tag, perm: 'tag', emit: 'tag', fields: ['name', 'color'], searchFields: ['name'], sort: { name: 1 },
  beforeCreate: (_req, data) => { data.name = String(data.name || '').trim(); },
  afterDelete: async (req, doc) => {
    const ws = req.tenant!.workspaceId;
    await Task.updateMany({ workspace: ws }, { $pull: { tags: doc._id } });
    await Project.updateMany({ workspace: ws }, { $pull: { tags: doc._id } });
  },
});

router.get('/', requirePermission('tag:read'), crud.list);
router.post('/', requirePermission('tag:create'), crud.create);
router.patch('/:id', requirePermission('tag:update'), crud.update);
router.delete('/:id', crud.remove);

const target = z.object({ entity: z.enum(['task', 'project']), entityId: z.string() });

router.post('/:id/assign', requirePermission('task:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { entity, entityId } = target.parse(req.body);
  const tag = await Tag.findOne({ _id: req.params.id, workspace: ws });
  if (!tag) throw ApiError.notFound('Tag not found');
  const Model: any = entity === 'task' ? Task : Project;
  const doc = await Model.findOneAndUpdate({ _id: entityId, workspace: ws }, { $addToSet: { tags: tag._id } }, { new: true });
  if (!doc) throw ApiError.notFound(`${entity} not found`);
  toWorkspace(ws, `${entity}:updated`, doc);
  res.json({ data: doc });
}));

router.post('/:id/remove', requirePermission('task:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { entity, entityId } = target.parse(req.body);
  const Model: any = entity === 'task' ? Task : Project;
  const doc = await Model.findOneAndUpdate({ _id: entityId, workspace: ws }, { $pull: { tags: req.params.id } }, { new: true });
  if (!doc) throw ApiError.notFound(`${entity} not found`);
  toWorkspace(ws, `${entity}:updated`, doc);
  res.json({ data: doc });
}));

export default router;
