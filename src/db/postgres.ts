import pg from 'pg';
import { logger } from '../lib/logger';

/**
 * Versioned schema migrations. Each runs once, inside a transaction, and is
 * recorded in `schema_migrations`. Append new entries — never edit old ones.
 */
const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE devices (
        id                       TEXT PRIMARY KEY,
        installation_id          TEXT NOT NULL UNIQUE,
        platform                 TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        push_token               TEXT UNIQUE,
        language                 TEXT NOT NULL,
        app_version              TEXT NOT NULL,
        os_version               TEXT,
        device_model             TEXT,
        notification_permission  TEXT NOT NULL,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_active_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX devices_reachable_idx ON devices (platform) WHERE push_token IS NOT NULL AND notification_permission = 'granted';
      CREATE INDEX devices_last_active_idx ON devices (last_active_at DESC);

      CREATE TABLE notifications (
        id               TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        body             TEXT NOT NULL,
        image_url        TEXT,
        destination      TEXT NOT NULL,
        entity_id        TEXT,
        data             JSONB,
        audience         TEXT NOT NULL,
        platform         TEXT NOT NULL,
        device_token     TEXT,
        target_token     TEXT,
        status           TEXT NOT NULL,
        scheduled_at     TIMESTAMPTZ,
        sent_at          TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        target_count     INTEGER NOT NULL DEFAULT 0,
        sent_count       INTEGER NOT NULL DEFAULT 0,
        delivered_count  INTEGER NOT NULL DEFAULT 0,
        failed_count     INTEGER NOT NULL DEFAULT 0,
        opened_count     INTEGER NOT NULL DEFAULT 0,
        error_message    TEXT
      );
      CREATE INDEX notifications_created_idx ON notifications (created_at DESC);
      CREATE INDEX notifications_due_idx ON notifications (scheduled_at) WHERE status = 'scheduled';

      CREATE TABLE notification_opens (
        notification_id  TEXT NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
        installation_id  TEXT NOT NULL,
        opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (notification_id, installation_id)
      );

      CREATE TABLE push_receipts (
        ticket_id        TEXT PRIMARY KEY,
        notification_id  TEXT NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
        device_id        TEXT REFERENCES devices (id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX push_receipts_created_idx ON push_receipts (created_at);
    `,
  },
];

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client losing its connection (e.g. Neon scaling to zero) must not crash the process.
  pool.on('error', (error) => logger.warn('Idle Postgres client error', { error }));
  return pool;
}

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    // Serialize concurrent boots (several instances starting at once).
    await client.query('SELECT pg_advisory_lock(4242)');
    const { rows } = await client.query<{ id: number }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.id));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [migration.id, migration.name]);
        await client.query('COMMIT');
        logger.info('Applied migration', { id: migration.id, name: migration.name });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(4242)').catch(() => undefined);
    client.release();
  }
}
