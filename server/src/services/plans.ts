import { Types } from 'mongoose';
import { Membership, Invite, Project, FileItem, Workspace } from '../models';
import { PLANS } from '../config/plans';
import { ApiError } from '../utils/ApiError';

export async function getUsage(workspaceId: string) {
  const [members, pendingInvites, projects, storage] = await Promise.all([
    Membership.countDocuments({ workspace: workspaceId }),
    Invite.countDocuments({ workspace: workspaceId, status: 'pending', expiresAt: { $gt: new Date() } }),
    Project.countDocuments({ workspace: workspaceId, status: { $ne: 'archived' } }),
    FileItem.aggregate([{ $match: { workspace: new Types.ObjectId(workspaceId), kind: 'file' } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]),
  ]);
  return {
    members, pendingInvites, projects,
    storageMB: Math.round(((storage[0]?.bytes || 0) / 1024 / 1024) * 100) / 100,
  };
}

export async function assertWithinLimit(workspaceId: string, resource: 'members' | 'projects' | 'storage', addAmount = 1) {
  const ws = await Workspace.findById(workspaceId).select('plan');
  if (!ws) throw ApiError.notFound('Workspace not found');
  const plan = PLANS[ws.plan as keyof typeof PLANS] ?? PLANS.free;
  const usage = await getUsage(workspaceId);

  if (resource === 'members' && usage.members + usage.pendingInvites + addAmount > plan.limits.members)
    throw new ApiError(402, `Your ${plan.name} plan allows ${plan.limits.members} members. Upgrade to add more.`, 'PLAN_LIMIT');
  if (resource === 'projects' && usage.projects + addAmount > plan.limits.projects)
    throw new ApiError(402, `Your ${plan.name} plan allows ${plan.limits.projects} projects. Upgrade to create more.`, 'PLAN_LIMIT');
  if (resource === 'storage' && usage.storageMB + addAmount / 1024 / 1024 > plan.limits.storageMB)
    throw new ApiError(402, `Storage limit of ${plan.limits.storageMB} MB reached on the ${plan.name} plan.`, 'PLAN_LIMIT');
}
