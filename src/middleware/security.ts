import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import type { ApiErrorBody } from '@beacon/shared';

const tooManyRequests: ApiErrorBody = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
};

export function securityMiddleware(corsOrigins: string[]): RequestHandler[] {
  return [
    helmet(),
    cors({
      // Mobile apps do not send an Origin header; browsers must be on the allow-list.
      origin: (origin, callback) => callback(null, !origin || corsOrigins.includes(origin)),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  ];
}

/** Generous limiter for the admin API. */
export const adminLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooManyRequests,
});

/** Tighter limiter for the unauthenticated endpoints used by the mobile app. */
export const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooManyRequests,
});
