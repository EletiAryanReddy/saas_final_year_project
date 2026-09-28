import { Router } from 'express';
import { z } from 'zod';
import { WikiPage } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { tenantCrud } from '../utils/crud';
import { asyncHandler, slugify } from '../utils/helpers';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/activity';
import { toWorkspace } from '../services/realtime';

const router = Router();
router.use(authenticate, tenant);

const pushVersion = (ws: string, id: any, doc: any, by: string) =>
  WikiPage.updateOne({ _id: id, workspace: ws }, { $push: { versions: { $each: [{ title: doc.title, content: doc.content, editedBy: by, editedAt: new Date() }], $slice: -25 } } });

const crud = tenantCrud({
  Model: WikiPage, perm: 'wiki', emit: 'wiki',
  fields: ['title', 'content', 'parent', 'project', 'icon'],
  searchFields: ['title', 'content'],
  filters: ['project', 'parent'],
  select: 'title icon parent project updatedAt createdBy updatedBy',
  sort: { title: 1 },
  beforeCreate: async (req, data) => {
    data.slug = slugify(data.title || 'page');
    data.updatedBy = req.user!.id;
    if (data.parent) {
      const p = await WikiPage.exists({ _id: data.parent, workspace: req.tenant!.workspaceId });
      if (!p) throw ApiError.badRequest('Parent page not found');
    }
  },
  beforeUpdate: async (req, doc, data) => {
    const ws = req.tenant!.workspaceId;
    if (data.parent && String(data.parent) === String(doc._id)) throw ApiError.badRequest('A page cannot be its own parent');
    if (data.parent && !(await WikiPage.exists({ _id: data.parent, workspace: ws }))) throw ApiError.badRequest('Parent page not found');
    if ((data.content !== undefined && data.content !== doc.content) || (data.title !== undefined && data.title !== doc.title)) {
      await pushVersion(ws, doc._id, doc, req.user!.id);
      if (data.title) data.slug = slugify(data.title);
    }
    data.updatedBy = req.user!.id;
  },
  afterCreate: async (req, doc) => { await logActivity({ workspace: req.tenant!.workspaceId, actor: req.user!.id, action: 'created', entityType: 'wiki', entityId: doc._id, project: doc.project, message: `created wiki page "${doc.title}"` }); },
  afterDelete: async (req, doc) => {
    // re-parent children to the deleted page's parent so nothing becomes unreachable
    await WikiPage.updateMany({ workspace: req.tenant!.workspaceId, parent: doc._id }, { $set: { parent: doc.parent ?? null } });
  },
});

router.get('/', requirePermission('wiki:read'), crud.list);
router.post('/', requirePermission('wiki:create'), crud.create);

router.get('/:id/versions', requirePermission('wiki:read'), asyncHandler(async (req, res) => {
  const page = await WikiPage.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId }).select('+versions').populate('versions.editedBy', 'name');
  if (!page) throw ApiError.notFound();
  res.json({ data: [...(page.versions as any[])].reverse().map((v, i, arr) => ({ index: arr.length - 1 - i, title: v.title, editedAt: v.editedAt, editedBy: v.editedBy, preview: String(v.content || '').slice(0, 140) })) });
}));

router.post('/:id/restore', requirePermission('wiki:update'), asyncHandler(async (req, res) => {
  const ws = req.tenant!.workspaceId;
  const { index } = z.object({ index: z.number().int().min(0) }).parse(req.body);
  const page = await WikiPage.findOne({ _id: req.params.id, workspace: ws }).select('+versions');
  const v = (page?.versions as any[] | undefined)?.[index];
  if (!page || !v) throw ApiError.notFound('Version not found');
  await pushVersion(ws, page._id, page, req.user!.id);
  page.title = v.title; page.content = v.content; page.updatedBy = req.user!.id as any;
  await page.save();
  toWorkspace(ws, 'wiki:updated', { _id: page._id, title: page.title });
  res.json({ data: { _id: page._id, title: page.title, content: page.content } });
}));

router.get('/:id', requirePermission('wiki:read'), asyncHandler(async (req, res) => {
  const page = await WikiPage.findOne({ _id: req.params.id, workspace: req.tenant!.workspaceId }).populate('updatedBy', 'name');
  if (!page) throw ApiError.notFound();
  res.json({ data: page });
}));
router.patch('/:id', requirePermission('wiki:update'), crud.update);
router.delete('/:id', crud.remove);

export default router;
