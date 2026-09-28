import type { Role } from '../config/permissions';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      tenant?: { workspaceId: string; role: Role; membershipId: string };
    }
  }
}
export {};
