import { Membership, Project, Tag } from '../models';
import { ApiError } from '../utils/ApiError';
import { isId, uniq } from '../utils/helpers';

/** Ensures every id is a real member of the workspace (prevents cross-tenant assignment). */
export async function assertMembers(workspaceId: string, ids: any) {
  if (ids === undefined) return;
  const list = uniq(Array.isArray(ids) ? ids : [ids]);
  if (list.some((i) => !isId(i))) throw ApiError.badRequest('Invalid user id');
  if (!list.length) return;
  const n = await Membership.countDocuments({ workspace: workspaceId, user: { $in: list } });
  if (n !== list.length) throw ApiError.badRequest('Some users are not members of this workspace');
}

export async function assertTags(workspaceId: string, ids: any) {
  if (ids === undefined) return;
  const list = uniq(Array.isArray(ids) ? ids : [ids]);
  if (list.some((i) => !isId(i))) throw ApiError.badRequest('Invalid tag id');
  if (!list.length) return;
  const n = await Tag.countDocuments({ workspace: workspaceId, _id: { $in: list } });
  if (n !== list.length) throw ApiError.badRequest('Some tags do not exist in this workspace');
}

export async function getProject(workspaceId: string, id: any) {
  if (!isId(id)) throw ApiError.badRequest('A valid project is required');
  const p = await Project.findOne({ _id: id, workspace: workspaceId });
  if (!p) throw ApiError.notFound('Project not found');
  return p;
}
