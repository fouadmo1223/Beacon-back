import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from '../lib/errors';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Protects admin routes with `Authorization: Bearer <ADMIN_API_KEY>` (constant-time compare). */
export function requireAdmin(apiKey: string): RequestHandler {
  const expected = digest(apiKey);
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token || !timingSafeEqual(digest(token), expected)) {
      next(HttpError.unauthorized());
      return;
    }
    next();
  };
}
