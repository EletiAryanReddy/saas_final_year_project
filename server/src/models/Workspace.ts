import { Schema, model } from 'mongoose';

const oid = Schema.Types.ObjectId;

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, maxlength: 300 },
    logo: String,
    owner: { type: oid, ref: 'User', required: true },
    plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
    subscription: {
      status: { type: String, enum: ['active', 'trialing', 'past_due', 'canceled'], default: 'active' },
      currentPeriodEnd: Date,
      providerCustomerId: String,
      providerSubscriptionId: String,
    },
    settings: {
      allowMemberInvites: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);
export const Workspace = model('Workspace', workspaceSchema);

const membershipSchema = new Schema(
  {
    user: { type: oid, ref: 'User', required: true },
    workspace: { type: oid, ref: 'Workspace', required: true, index: true },
    role: { type: String, enum: ['owner', 'admin', 'member', 'guest'], default: 'member' },
    status: { type: String, enum: ['active'], default: 'active' },
  },
  { timestamps: true }
);
membershipSchema.index({ user: 1, workspace: 1 }, { unique: true });
export const Membership = model('Membership', membershipSchema);

const inviteSchema = new Schema(
  {
    workspace: { type: oid, ref: 'Workspace', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['admin', 'member', 'guest'], default: 'member' },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: oid, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
  },
  { timestamps: true }
);
export const Invite = model('Invite', inviteSchema);
