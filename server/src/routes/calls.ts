import { Router } from 'express';
import { Call } from '../models';
import { authenticate } from '../middleware/auth';
import { tenant } from '../middleware/tenant';
import { asyncHandler } from '../utils/helpers';
import { env } from '../config/env';

const router = Router();
router.use(authenticate);

/** STUN/TURN servers handed to RTCPeerConnection. Add TURN for users behind symmetric NATs. */
router.get('/ice-servers', (_req, res) => {
  const iceServers: any[] = [{ urls: env.webrtc.stun }];
  if (env.webrtc.turnUrl.length) iceServers.push({ urls: env.webrtc.turnUrl, username: env.webrtc.turnUser, credential: env.webrtc.turnCred });
  res.json({ data: { iceServers, maxMeshPeers: env.webrtc.maxMeshPeers } });
});

router.get('/', tenant, asyncHandler(async (req, res) => {
  const me = req.user!.id;
  const data = await Call.find({ workspace: req.tenant!.workspaceId, $or: [{ initiator: me }, { invited: me }, { 'participants.user': me }] })
    .sort({ startedAt: -1 }).limit(50)
    .populate('initiator', 'name avatar').populate('invited', 'name avatar').populate('participants.user', 'name avatar');
  res.json({ data });
}));

export default router;
