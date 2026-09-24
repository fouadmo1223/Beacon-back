import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load `.env` (Node >= 20.12) without an extra dependency. Real env vars win.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Comma separated list of origins allowed to call the admin API (the dashboard). */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Secret the dashboard operator must provide (Authorization: Bearer <key>). */
  ADMIN_API_KEY: z.string().min(16, { error: 'ADMIN_API_KEY must be at least 16 characters' }),
  /** Optional Expo access token — required if "Enhanced push security" is enabled in EAS. */
  EXPO_ACCESS_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  /** PostgreSQL connection string (e.g. Neon). When set, the JSON file store is not used. */
  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined))
    .refine((value) => !value || /^postgres(ql)?:\/\//.test(value), { error: 'Must be a postgres:// connection string' }),
  /** JSON file used as a tiny development database when DATABASE_URL is empty. Empty string = in-memory only. */
  DATA_FILE: z.string().default('./data/db.json'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  /** Expo recommends checking push receipts ~15 minutes after sending. */
  RECEIPT_CHECK_DELAY_MS: z.coerce.number().int().min(0).default(15 * 60_000),
  TRUST_PROXY: booleanString,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid server environment:\n${details}\nSee apps/server/.env.example`);
  }
  return parsed.data;
}
