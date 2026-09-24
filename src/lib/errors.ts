import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@beacon/shared';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details: Record<string, string[]>) {
    return new HttpError(422, 'VALIDATION_ERROR', 'The request contains invalid fields', details);
  }

  static unauthorized(message = 'Missing or invalid admin API key') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'Resource not found') {
    return new HttpError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(HttpError.notFound(`Route ${req.method} ${req.path} does not exist`));
};

/** Converts any thrown error into the shared `ApiErrorBody` shape; never leaks stack traces. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message, details: error.details } };
    res.status(error.status).json(body);
    return;
  }

  // body-parser errors (invalid JSON / payload too large)
  const status = (error as { status?: number; type?: string }).status;
  if (status && status >= 400 && status < 500) {
    const body: ApiErrorBody = {
      error: { code: 'BAD_REQUEST', message: status === 413 ? 'Payload too large' : 'Malformed request body' },
    };
    res.status(status).json(body);
    return;
  }

  logger.error('Unhandled error', { path: req.path, method: req.method, error });
  const body: ApiErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  res.status(500).json(body);
};
