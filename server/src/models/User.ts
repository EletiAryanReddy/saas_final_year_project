import { Schema, model } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    avatar: String,
    googleId: { type: String, index: true, sparse: true },
    isVerified: { type: Boolean, default: false },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    verifyTokenHash: { type: String, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    refreshTokens: {
      type: [{ tokenHash: String, expiresAt: Date, userAgent: String }],
      select: false,
      default: [],
    },
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    lastSeen: Date,
    currentWorkspace: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        chat: { type: Boolean, default: true },
        task: { type: Boolean, default: true },
        project: { type: Boolean, default: true },
        meeting: { type: Boolean, default: true },
        workspace: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

export const User = model('User', userSchema);

export const publicUser = (u: any) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  avatar: u.avatar,
  isVerified: u.isVerified,
  currentWorkspace: u.currentWorkspace ? String(u.currentWorkspace) : null,
  preferences: u.preferences,
  createdAt: u.createdAt,
});
