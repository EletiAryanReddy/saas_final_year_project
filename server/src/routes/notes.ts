import { Router } from 'express';
import { Note } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';

const router = Router();
router.use(authenticate, tenant);

/**
 * Notes are always private to their author - there is no sharing and no RBAC gate beyond
 * "you must be a member of this workspace". `scope` filters every query to createdBy = me,
 * and ownerField makes the shared delete-permission check in tenantCrud a no-op since every
 * note the caller can even see is already their own.
 */
const crud = tenantCrud({
  Model: Note, perm: 'note', emit: 'note',
  fields: ['title', 'body', 'color', 'pinned'],
  searchFields: ['title', 'body'],
  sort: { pinned: -1, updatedAt: -1 },
  scope: (req) => ({ createdBy: req.user!.id }),
});

router.get('/', crud.list);
router.post('/', crud.create);
router.get('/:id', crud.get);
router.patch('/:id', crud.update);
router.delete('/:id', crud.remove);

export default router;
