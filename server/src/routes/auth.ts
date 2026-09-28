import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { User, Membership, publicUser } from '../models';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { asyncHandler, sha256, randomToken, otp6 } from '../utils/helpers';
import { signAccess, signRefresh, verifyRefresh } from '../utils/tokens';
import { sendMail, mailLayout, mailConfigured } from '../utils/mailer';
import { authenticate } from '../middleware/auth';

const router = Router();
const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Try again in a few minutes.' } });
router.use(['/login', '/register', '/verify-email', '/resend-otp', '/forgot-password', '/reset-password', '/google'], authLimiter);

const COOKIE = 'refreshToken';
const cookieOpts = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const pw = z.string().min(8, 'Password must be at least 8 characters').max(100)
  .regex(/[A-Za-z]/, 'Password needs a letter').regex(/[0-9]/, 'Password needs a number');

async function issueSession(req: Request, res: Response, user: any) {
  const refresh = signRefresh(String(user._id));
  const fresh = await User.findById(user._id).select('+refreshTokens');
  const tokens = (fresh!.refreshTokens || []).filter((t: any) => t.expiresAt > new Date()).slice(-4);
  tokens.push({ tokenHash: sha256(refresh), expiresAt: new Date(Date.now() + cookieOpts.maxAge), userAgent: String(req.headers['user-agent'] || '').slice(0, 120) });
  fresh!.set('refreshTokens', tokens);
  await fresh!.save();
  res.cookie(COOKIE, refresh, cookieOpts);
  return { accessToken: signAccess(String(user._id)), user: publicUser(user) };
}

async function sendVerification(user: any) {
  const otp = otp6();
  const token = randomToken(24);
  user.otpHash = sha256(otp);
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.otpAttempts = 0;
  user.verifyTokenHash = sha256(token);
  await user.save();
  const link = `${env.clientUrl}/verify-email?email=${encodeURIComponent(user.email)}&token=${token}`;
  await sendMail(
    user.email, 'Verify your CollabSpace email',
    mailLayout('Verify your email', `<p>Your verification code is</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${otp}</p><p>It expires in 10 minutes. Or <a href="${link}">verify with one click</a>.</p>`)
  );
  return otp;
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email(), password: pw }).parse(req.body);
  let user: any = await User.findOne({ email: email.toLowerCase() }).select('+password +otpHash +otpExpires +verifyTokenHash');
  if (user?.isVerified) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  if (!user) user = new User({ email });
  user.name = name;
  user.password = await bcrypt.hash(password, 12);
  const otp = await sendVerification(user);
  res.status(201).json({
    message: 'Account created. Enter the code we emailed you.',
    email: user.email,
    ...(!mailConfigured && !env.isProd ? { devOtp: otp } : {}),
  });
}));

router.post('/resend-otp', asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user: any = await User.findOne({ email: email.toLowerCase() }).select('+otpHash +otpExpires +verifyTokenHash');
  let otp: string | undefined;
  if (user && !user.isVerified) otp = await sendVerification(user);
  res.json({ message: 'If that account needs verification, a new code was sent.', ...(!mailConfigured && !env.isProd && otp ? { devOtp: otp } : {}) });
}));

router.post('/verify-email', asyncHandler(async (req, res) => {
  const { email, otp, token } = z.object({ email: z.string().email(), otp: z.string().length(6).optional(), token: z.string().optional() }).parse(req.body);
  const user: any = await User.findOne({ email: email.toLowerCase() }).select('+otpHash +otpExpires +otpAttempts +verifyTokenHash');
  if (!user) throw ApiError.badRequest('Invalid or expired code');
  if (user.isVerified) throw ApiError.badRequest('Email is already verified');
  if (!user.otpExpires || user.otpExpires < new Date()) throw ApiError.badRequest('Code expired. Request a new one.', 'OTP_EXPIRED');
  if (user.otpAttempts >= 5) throw ApiError.badRequest('Too many wrong attempts. Request a new code.', 'OTP_LOCKED');

  const ok = (otp && user.otpHash === sha256(otp)) || (token && user.verifyTokenHash === sha256(token));
  if (!ok) {
    user.otpAttempts += 1;
    await user.save();
    throw ApiError.badRequest('Incorrect code');
  }
  user.isVerified = true;
  user.otpHash = user.otpExpires = user.verifyTokenHash = undefined;
  user.otpAttempts = 0;
  await user.save();
  res.json(await issueSession(req, res, user));
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user: any = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (user?.lockUntil && user.lockUntil > new Date())
    throw new ApiError(423, 'Account temporarily locked after too many failed attempts. Try again in 15 minutes.', 'LOCKED');
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    if (user) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= 5) { user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); user.failedLogins = 0; }
      await user.save();
    }
    throw ApiError.unauthorized('Incorrect email or password', 'BAD_CREDENTIALS');
  }
  if (!user.isVerified) throw ApiError.forbidden('Verify your email to continue', 'EMAIL_NOT_VERIFIED');
  user.failedLogins = 0; user.lockUntil = undefined;
  await user.save();
  res.json(await issueSession(req, res, user));
}));

router.post('/google', asyncHandler(async (req, res) => {
  if (!googleClient) throw ApiError.badRequest('Google sign-in is not configured on the server');
  const { credential } = z.object({ credential: z.string().min(10) }).parse(req.body);
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw ApiError.unauthorized('Google account email is not verified');
  let user: any = await User.findOne({ $or: [{ googleId: p.sub }, { email: p.email.toLowerCase() }] });
  if (!user) user = new User({ email: p.email, name: p.name || p.email.split('@')[0], avatar: p.picture, googleId: p.sub, isVerified: true });
  else { user.googleId = user.googleId || p.sub; user.isVerified = true; user.avatar = user.avatar || p.picture; }
  await user.save();
  res.json(await issueSession(req, res, user));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw ApiError.unauthorized('No session', 'NO_SESSION');
  let payload;
  try { payload = verifyRefresh(token); } catch { res.clearCookie(COOKIE, { path: cookieOpts.path }); throw ApiError.unauthorized('Session expired', 'NO_SESSION'); }
  const user: any = await User.findById(payload.sub).select('+refreshTokens');
  if (!user) throw ApiError.unauthorized('Session expired', 'NO_SESSION');
  const hash = sha256(token);
  const idx = (user.refreshTokens || []).findIndex((t: any) => t.tokenHash === hash);
  if (idx === -1) {
    // A valid signature but unknown token => it was already rotated: assume theft and revoke every session.
    user.refreshTokens = [];
    await user.save();
    res.clearCookie(COOKIE, { path: cookieOpts.path });
    throw ApiError.unauthorized('Session revoked. Please sign in again.', 'TOKEN_REUSE');
  }
  user.refreshTokens.splice(idx, 1);
  await user.save();
  res.json(await issueSession(req, res, user));
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const p = verifyRefresh(token);
      await User.updateOne({ _id: p.sub }, { $pull: { refreshTokens: { tokenHash: sha256(token) } } });
    } catch { /* ignore */ }
  }
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.json({ message: 'Signed out' });
}));

router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user!.id }, { $set: { refreshTokens: [] } });
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.json({ message: 'Signed out of all devices' });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user: any = await User.findOne({ email: email.toLowerCase() }).select('+resetTokenHash +resetExpires');
  if (user) {
    const token = randomToken(32);
    user.resetTokenHash = sha256(token);
    user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${env.clientUrl}/reset-password?token=${token}`;
    await sendMail(user.email, 'Reset your CollabSpace password', mailLayout('Reset your password', `<p>Use the link below within 1 hour.</p><p><a href="${link}">Choose a new password</a></p><p>If you did not ask for this, ignore this email.</p>`));
  }
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20), password: pw }).parse(req.body);
  const user: any = await User.findOne({ resetTokenHash: sha256(token), resetExpires: { $gt: new Date() } }).select('+resetTokenHash +resetExpires +password +refreshTokens');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired', 'BAD_RESET');
  user.password = await bcrypt.hash(password, 12);
  user.resetTokenHash = user.resetExpires = undefined;
  user.refreshTokens = [];
  user.failedLogins = 0; user.lockUntil = undefined;
  await user.save();
  res.json({ message: 'Password updated. You can sign in now.' });
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().optional(), newPassword: pw }).parse(req.body);
  const user: any = await User.findById(req.user!.id).select('+password +refreshTokens');
  if (!user) throw ApiError.notFound();
  if (user.password && !(await bcrypt.compare(currentPassword || '', user.password))) throw ApiError.badRequest('Current password is incorrect');
  user.password = await bcrypt.hash(newPassword, 12);
  user.refreshTokens = [];
  await user.save();
  res.clearCookie(COOKIE, { path: cookieOpts.path });
  res.json({ message: 'Password changed. Please sign in again.' });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized('Account not found', 'NO_SESSION');
  const memberships = await Membership.find({ user: user._id }).populate('workspace', 'name slug logo plan owner');
  res.json({
    user: publicUser(user),
    workspaces: memberships.filter((m) => m.workspace).map((m: any) => ({ membershipId: String(m._id), role: m.role, workspace: m.workspace })),
  });
}));

export default router;
