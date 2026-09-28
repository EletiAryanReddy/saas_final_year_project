import { Request, Response, NextFunction } from 'express';
import { Membership } from '../models';
import { ApiError } from '../utils/ApiError';
import { isId } from '../utils/helpers';
import { can } from '../config/permissions';

/**
 * Resolves the active workspace from the `x-workspace-id` header and verifies the caller is a member.
 * Every tenant-scoped query MUST filter by req.tenant.workspaceId - this is the tenant isolation boundary.
 */
export async function tenant(req: Request, _res: Response, next: NextFunction) {
  try {
    const wsId = req.headers['x-workspace-id'];
    if (!isId(wsId)) throw ApiError.badRequest('x-workspace-id header is required', 'NO_WORKSPACE');
    const m = await Membership.findOne({ user: req.user!.id, workspace: wsId });
    if (!m) throw ApiError.forbidden('You are not a member of this workspace', 'NOT_A_MEMBER');
    req.tenant = { workspaceId: wsId, role: m.role as any, membershipId: String(m._id) };
    next();
  } catch (e) { next(e); }
}

export const requirePermission = (perm: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.tenant || !can(req.tenant.role, perm)) return next(ApiError.forbidden(`Your role cannot perform "${perm}"`, 'FORBIDDEN'));
  next();
};
