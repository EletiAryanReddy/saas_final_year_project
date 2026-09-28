import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../utils/tokens';
import { ApiError } from '../utils/ApiError';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(ApiError.unauthorized('Missing access token', 'NO_TOKEN'));
  try {
    req.user = { id: verifyAccess(header.slice(7)).sub };
    next();
  } catch {
    next(ApiError.unauthorized('Access token expired or invalid', 'TOKEN_EXPIRED'));
  }
}
