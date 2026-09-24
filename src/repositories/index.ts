import { createPool, migrate } from '../db/postgres';
import { logger } from '../lib/logger';
import { JsonDeviceRepository } from './json/device.repository';
import { JsonNotificationRepository } from './json/notification.repository';
import { JsonStore } from './json/store';
import { PgDeviceRepository } from './postgres/device.repository';
import { PgNotificationRepository } from './postgres/notification.repository';
import type { Repositories } from './types';

/** In-memory / JSON-file repositories (local dev without a database, tests). */
export function createJsonRepositories(filePath: string | null): Repositories {
  const store = new JsonStore(filePath);
  return {
    devices: new JsonDeviceRepository(store),
    notifications: new JsonNotificationRepository(store),
    close: async () => store.flush(),
  };
}

/** PostgreSQL repositories (Neon in production). Runs pending migrations first. */
export async function createPostgresRepositories(connectionString: string): Promise<Repositories> {
  const pool = createPool(connectionString);
  await migrate(pool);
  return {
    devices: new PgDeviceRepository(pool),
    notifications: new PgNotificationRepository(pool),
    close: () => pool.end(),
  };
}

export async function createRepositories(options: { databaseUrl?: string; dataFile: string }): Promise<Repositories> {
  if (options.databaseUrl) {
    logger.info('Using PostgreSQL database');
    return createPostgresRepositories(options.databaseUrl);
  }
  logger.warn('DATABASE_URL not set — using the JSON file store (development only)', { file: options.dataFile || 'memory' });
  return createJsonRepositories(options.dataFile || null);
}

export type { Repositories } from './types';
