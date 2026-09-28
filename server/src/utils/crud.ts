import { Request, Response } from 'express';
import { Model } from 'mongoose';
import { ApiError } from './ApiError';
import { asyncHandler, pick, escapeRegex, paging, qs } from './helpers';
import { can } from '../config/permissions';
import { toWorkspace } from '../services/realtime';

type Hook = (req: Request, doc: any, extra?: any) => Promise<void> | void;

export interface CrudOptions {
  Model: Model<any>;
  /** permission resource name, e.g. "project" -> project:create, project:update ... */
  perm: string;
  /** whitelisted fields a client may write */
  fields: string[];
  searchFields?: string[];
  /** query-string equality filters; value "me" resolves to the current user id */
  filters?: string[];
  populate?: any;
  sort?: any;
  /** socket event prefix; emits <prefix>:created|updated|deleted to the workspace room */
  emit?: string;
  ownerField?: string;
  scope?: (req: Request) => Record<string, any>;
  beforeCreate?: (req: Request, data: any) => Promise<void> | void;
  beforeUpdate?: (req: Request, doc: any, data: any) => Promise<void> | void;
  afterCreate?: Hook;
  afterUpdate?: Hook;
  afterDelete?: Hook;
  decorateList?: (req: Request, docs: any[]) => Promise<any[]>;
  select?: string;
}

/**
 * Builds tenant-scoped CRUD handlers. Every query is filtered by the caller's workspace,
 * so one tenant can never read or mutate another tenant's documents.
 */
export function tenantCrud(o: CrudOptions) {
  const ownerField = o.ownerField || 'createdBy';
  const wsOf = (req: Request) => req.tenant!.workspaceId;
  const uid = (req: Request) => req.user!.id;
  const load = async (req: Request) => {
    let q = o.Model.findOne({ _id: req.params.id, workspace: wsOf(req), ...(o.scope?.(req) || {}) });
    if (o.populate) q = q.populate(o.populate);
    const doc = await q;
    if (!doc) throw ApiError.notFound();
    return doc;
  };
  const push = (req: Request, ev: string, payload: any) => o.emit && toWorkspace(wsOf(req), `${o.emit}:${ev}`, payload);

  const list = asyncHandler(async (req, res) => {
    const q: any = { workspace: wsOf(req), ...(o.scope?.(req) || {}) };
    for (const f of o.filters || []) {
      const v = qs(req.query[f]);
      if (v !== undefined) q[f] = v === 'me' ? uid(req) : v;
    }
    const s = qs(req.query.q);
    if (s && o.searchFields?.length) q.$or = o.searchFields.map((f) => ({ [f]: { $regex: escapeRegex(s), $options: 'i' } }));
    const { page, limit, skip } = paging(req);
    let query = o.Model.find(q).sort(o.sort || { createdAt: -1 }).skip(skip).limit(limit);
    if (o.select) query = query.select(o.select);
    if (o.populate) query = query.populate(o.populate);
    const [docs, total] = await Promise.all([query, o.Model.countDocuments(q)]);
    let data: any[] = docs.map((d) => d.toObject());
    if (o.decorateList) data = await o.decorateList(req, data);
    res.json({ data, page, limit, total });
  });

  const get = asyncHandler(async (req, res) => { res.json({ data: await load(req) }); });

  const create = asyncHandler(async (req, res) => {
    const data = pick(req.body, o.fields);
    data.workspace = wsOf(req);
    data[ownerField] = uid(req);
    await o.beforeCreate?.(req, data);
    let doc: any = await o.Model.create(data);
    if (o.populate) doc = await doc.populate(o.populate);
    await o.afterCreate?.(req, doc);
    push(req, 'created', doc);
    res.status(201).json({ data: doc });
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await load(req);
    const before = doc.toObject();
    const data = pick(req.body, o.fields);
    await o.beforeUpdate?.(req, doc, data);
    doc.set(data);
    await doc.save();
    const fresh = o.populate ? await doc.populate(o.populate) : doc;
    await o.afterUpdate?.(req, fresh, before);
    push(req, 'updated', fresh);
    res.json({ data: fresh });
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await load(req);
    const role = req.tenant!.role;
    const owns = String((doc as any)[ownerField]?._id || (doc as any)[ownerField]) === uid(req);
    if (!can(role, `${o.perm}:delete`) && !(owns && can(role, `${o.perm}:delete:own`)))
      throw ApiError.forbidden(`Your role cannot delete this ${o.perm}`, 'FORBIDDEN');
    await doc.deleteOne();
    await o.afterDelete?.(req, doc);
    push(req, 'deleted', { _id: String(doc._id) });
    res.json({ data: { _id: String(doc._id) } });
  });

  return { list, get, create, update, remove, load };
}
