import { Router } from 'express';
import { z } from 'zod';
import {
  Workspace, Membership, Invite, User, Project, Task, Comment, Tag, Conversation, Message, CalendarEvent,
  Meeting, Call, FileItem, WikiPage, Whiteboard, Notification, Activity, Note, Complaint, AiMessage, Announcement,
} from '../models';
import { authenticate } from '../middleware/auth';
import { tenant, requirePermission } from '../middleware/tenant';
import { ApiError } from '../utils/ApiError';
import { asyncHandler, slugify, randomToken, sha256, isId } from '../utils/helpers';
import { effectivePermissions, permissionMatrix } from '../config/permissions';
import { assertWithinLimit } from '../services/plans';
import { notify } from '../services/notify';
import { logActivity } from '../services/activity';
import { deleteStored } from '../utils/storage';
import { sendMail, mailLayout } from '../utils/mailer';
import { env } from '../config/env';
import { toWorkspace } from '../services/realtime';

const router = Router();
router.use(authenticate);

export async function ensureWorkspaceConversation(workspaceId: string, userId?: string) {
  let c = await Conversation.findOne({ workspace: workspaceId, type: 'workspace' });
  if (!c) c = await Conversation.create({ workspace: workspaceId, type: 'workspace', name: 'General', createdBy: userId });
  return c;
}

router.get('/permissions', (_req, res) => res.json({ data: permissionMatrix() }));

router.get('/', asyncHandler(async (req, res) => {
  const ms = await Membership.find({ user: req.user!.id }).populate('workspace', 'name slug logo plan owner');
  res.json({ data: ms.filter((m) => m.workspace).map((m: any) => ({ membershipId: String(m._id), role: m.role, workspace: m.workspace })) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, description } = z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).optional() }).parse(req.body);
  const ownedFree = await Workspace.countDocuments({ owner: req.user!.id });
  if (ownedFree >= 5) throw ApiError.badRequest('You can own up to 5 workspaces');
  let slug = slugify(name);
  if (await Workspace.exists({ slug })) slug = `${slug}-${randomToken(3)}`;
  const ws = await Workspace.create({ name, description, slug, owner: req.user!.id });
  const m = await Membership.create({ user: req.user!.id, workspace: ws._id, role: 'owner' });
  await ensureWorkspaceConversation(String(ws._id), req.user!.id);
  await User.updateOne({ _id: req.user!.id }, { currentWorkspace: ws._id });
  res.status(201).json({ data: { membershipId: String(m._id), role: 'owner', workspace: ws } });
}));

// ---------- tenant-scoped ----------
const t = Router();
router.use('/current', tenant, t);

t.get('/', asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.tenant!.workspaceId);
  if (!ws) throw ApiError.notFound();
  res.json({ data: { ...ws.toObject(), role: req.tenant!.role, permissions: effectivePermissions(req.tenant!.role) } });
}));

t.patch('/', requirePermission('workspace:update'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().max(300).optional(),
    logo: z.string().url().optional(),
    settings: z.object({ allowMemberInvites: z.boolean().optional() }).optional(),
  }).parse(req.body);
  const ws = await Workspace.findById(req.tenant!.workspaceId);
  if (!ws) throw ApiError.notFound();
  if (body.name) ws.name = body.name;
  if (body.description !== undefined) ws.description = body.description;
  if (body.logo) ws.logo = body.logo;
  if (body.settings?.allowMemberInvites !== undefined) ws.set('settings.allowMemberInvites', body.settings.allowMemberInvites);
  await ws.save();
  toWorkspace(String(ws._id), 'workspace:updated', ws.toObject());
  res.json({ data: ws });
}));

t.delete('/', requirePermission('workspace:delete'), asyncHandler(async (req, res) => {
  const id = req.tenant!.workspaceId;
  const { confirmName } = z.object({ confirmName: z.string() }).parse(req.body);
  const ws = await Workspace.findById(id);
  if (!ws || ws.name !== confirmName) throw ApiError.badRequest('Type the workspace name exactly to confirm');
  const files = await FileItem.find({ workspace: id, kind: 'file' });
  await Promise.all(files.map((f) => deleteStored(f as any)));
  const filter = { workspace: id };
  await Promise.all([
    Project.deleteMany(filter), Task.deleteMany(filter), Comment.deleteMany(filter), Tag.deleteMany(filter),
    Conversation.deleteMany(filter), Message.deleteMany(filter), CalendarEvent.deleteMany(filter), Meeting.deleteMany(filter),
    Call.deleteMany(filter), FileItem.deleteMany(filter), WikiPage.deleteMany(filter), Whiteboard.deleteMany(filter),
    Notification.deleteMany(filter), Activity.deleteMany(filter), Invite.deleteMany(filter), Membership.deleteMany(filter),
    Note.deleteMany(filter), Complaint.deleteMany(filter), AiMessage.deleteMany(filter), Announcement.deleteMany(filter),
  ]);
  await ws.deleteOne();
  await User.updateMany({ currentWorkspace: id }, { $unset: { currentWorkspace: 1 } });
  res.json({ message: 'Workspace deleted' });
}));

t.get('/members', asyncHandler(async (req, res) => {
  const ms = await Membership.find({ workspace: req.tenant!.workspaceId }).populate('user', 'name email avatar lastSeen').sort({ createdAt: 1 });
  res.json({ data: ms.filter((m) => m.user).map((m: any) => ({ membershipId: String(m._id), role: m.role, joinedAt: m.createdAt, user: m.user })) });
}));

t.patch('/members/:membershipId', requirePermission('member:manage'), asyncHandler(async (req, res) => {
  const { role } = z.object({ role: z.enum(['admin', 'member', 'guest']) }).parse(req.body);
  const m = await Membership.findOne({ _id: req.params.membershipId, workspace: req.tenant!.workspaceId });
  if (!m) throw ApiError.notFound('Member not found');
  if (m.role === 'owner') throw ApiError.forbidden('The owner role can only be changed by transferring ownership');
  if ((role === 'admin' || m.role === 'admin') && req.tenant!.role !== 'owner') throw ApiError.forbidden('Only the owner can grant or revoke admin access');
  m.role = role;
  await m.save();
  await notify({ workspace: req.tenant!.workspaceId, users: [m.user], actor: req.user!.id, type: 'workspace', title: 'Your role changed', body: `You are now ${role}.` });
  toWorkspace(req.tenant!.workspaceId, 'member:updated', { membershipId: String(m._id), role });
  res.json({ data: m });
}));

t.delete('/members/:membershipId', asyncHandler(async (req, res) => {
  const m = await Membership.findOne({ _id: req.params.membershipId, workspace: req.tenant!.workspaceId });
  if (!m) throw ApiError.notFound('Member not found');
  const self = String(m.user) === req.user!.id;
  if (m.role === 'owner') throw ApiError.forbidden('Transfer ownership before removing the owner');
  if (!self) {
    if (!effectivePermissions(req.tenant!.role).includes('member:manage')) throw ApiError.forbidden('Your role cannot remove members');
    if (m.role === 'admin' && req.tenant!.role !== 'owner') throw ApiError.forbidden('Only the owner can remove admins');
  }
  await m.deleteOne();
  await Task.updateMany({ workspace: m.workspace }, { $pull: { assignees: m.user } });
  await Project.updateMany({ workspace: m.workspace }, { $pull: { members: m.user } });
  toWorkspace(req.tenant!.workspaceId, 'member:removed', { membershipId: String(m._id), userId: String(m.user) });
  res.json({ message: self ? 'You left the workspace' : 'Member removed' });
}));

t.post('/transfer-ownership', requirePermission('ownership:transfer'), asyncHandler(async (req, res) => {
  const { membershipId } = z.object({ membershipId: z.string() }).parse(req.body);
  const target = await Membership.findOne({ _id: membershipId, workspace: req.tenant!.workspaceId });
  if (!target || target.role === 'owner') throw ApiError.badRequest('Choose another member');
  await Membership.updateOne({ _id: req.tenant!.membershipId }, { role: 'admin' });
  target.role = 'owner';
  await target.save();
  await Workspace.updateOne({ _id: req.tenant!.workspaceId }, { owner: target.user });
  toWorkspace(req.tenant!.workspaceId, 'member:updated', { membershipId: String(target._id), role: 'owner' });
  res.json({ message: 'Ownership transferred. You are now an admin.' });
}));

// ---------- announcements (real-time broadcast) ----------
t.get('/announcements', asyncHandler(async (req, res) => {
  const data = await Announcement.find({ workspace: req.tenant!.workspaceId }).sort({ createdAt: -1 }).limit(20).populate('createdBy', 'name avatar');
  res.json({ data });
}));

t.post('/announce', requirePermission('announcement:create'), asyncHandler(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
  const ws = req.tenant!.workspaceId;
  const doc = await (await Announcement.create({ workspace: ws, body, createdBy: req.user!.id })).populate('createdBy', 'name avatar');
  const members = await Membership.find({ workspace: ws }).select('user');
  await notify({ workspace: ws, users: members.map((m) => m.user), actor: req.user!.id, type: 'workspace', title: 'Workspace announcement', body, email: true });
  toWorkspace(ws, 'announcement:new', doc.toObject());
  res.status(201).json({ data: doc });
}));

// ---------- invites ----------
t.get('/invites', requirePermission('member:invite'), asyncHandler(async (req, res) => {
  const data = await Invite.find({ workspace: req.tenant!.workspaceId, status: 'pending', expiresAt: { $gt: new Date() } }).select('-tokenHash').sort({ createdAt: -1 });
  res.json({ data });
}));

t.post('/invites', asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.tenant!.workspaceId);
  if (!ws) throw ApiError.notFound();
  const canInvite = effectivePermissions(req.tenant!.role).includes('member:invite') || (ws.settings?.allowMemberInvites && req.tenant!.role === 'member');
  if (!canInvite) throw ApiError.forbidden('Your role cannot invite members');
  const { email, role } = z.object({ email: z.string().trim().email(), role: z.enum(['admin', 'member', 'guest']).default('member') }).parse(req.body);
  if (role === 'admin' && req.tenant!.role !== 'owner') throw ApiError.forbidden('Only the owner can invite admins');
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing && (await Membership.exists({ user: existing._id, workspace: ws._id }))) throw ApiError.conflict('That person is already a member');
  await Invite.updateMany({ workspace: ws._id, email: email.toLowerCase(), status: 'pending' }, { status: 'revoked' });
  await assertWithinLimit(String(ws._id), 'members', 1);

  const token = randomToken(24);
  await Invite.create({ workspace: ws._id, email, role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5), invitedBy: req.user!.id });
  const inviter = await User.findById(req.user!.id).select('name');
  const link = `${env.clientUrl}/invite/${token}`;
  await sendMail(email, `${inviter?.name} invited you to ${ws.name} on CollabSpace`, mailLayout(`Join ${ws.name}`, `<p>${inviter?.name} invited you as <b>${role}</b>.</p><p><a href="${link}">Accept invitation</a> (valid for 7 days)</p>`));
  res.status(201).json({ message: 'Invitation sent', ...(env.isProd ? {} : { devLink: link }) });
}));

t.delete('/invites/:id', requirePermission('member:invite'), asyncHandler(async (req, res) => {
  await Invite.updateOne({ _id: req.params.id, workspace: req.tenant!.workspaceId }, { status: 'revoked' });
  res.json({ message: 'Invitation revoked' });
}));

export const publicInviteRouter = Router();

publicInviteRouter.get('/:token', asyncHandler(async (req, res) => {
  const inv: any = await Invite.findOne({ tokenHash: sha256(req.params.token), status: 'pending', expiresAt: { $gt: new Date() } }).populate('workspace', 'name').populate('invitedBy', 'name');
  if (!inv) throw ApiError.notFound('This invitation is invalid or has expired');
  res.json({ data: { email: inv.email, role: inv.role, workspaceName: inv.workspace?.name, invitedBy: inv.invitedBy?.name } });
}));

publicInviteRouter.post('/:token/accept', authenticate, asyncHandler(async (req, res) => {
  const inv: any = await Invite.findOne({ tokenHash: sha256(req.params.token), status: 'pending', expiresAt: { $gt: new Date() } });
  if (!inv) throw ApiError.notFound('This invitation is invalid or has expired');
  const user = await User.findById(req.user!.id);
  if (!user || user.email !== inv.email) throw ApiError.forbidden(`This invitation was sent to ${inv.email}. Sign in with that email.`, 'INVITE_EMAIL_MISMATCH');
  if (!(await Membership.exists({ user: user._id, workspace: inv.workspace }))) await Membership.create({ user: user._id, workspace: inv.workspace, role: inv.role });
  inv.status = 'accepted';
  await inv.save();
  await ensureWorkspaceConversation(String(inv.workspace));
  await User.updateOne({ _id: user._id }, { currentWorkspace: inv.workspace });
  await logActivity({ workspace: String(inv.workspace), actor: String(user._id), action: 'joined', entityType: 'workspace', message: `${user.name} joined the workspace` });
  toWorkspace(String(inv.workspace), 'member:joined', { userId: String(user._id) });
  res.json({ data: { workspaceId: String(inv.workspace) } });
}));

export default router;
