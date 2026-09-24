import type { z } from 'zod';
import { flattenZodIssues } from '@beacon/shared';
import { HttpError } from './errors';

/** Parses untrusted input with a zod schema, throwing a 422 HttpError on failure. */
export function parseOrThrow<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) throw HttpError.validation(flattenZodIssues(result.error));
  return result.data;
}
