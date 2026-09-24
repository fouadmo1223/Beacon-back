import type pg from 'pg';
import { createId, type DeviceListQuery, type DevicePlatform, type RegisterDeviceInput } from '@beacon/shared';
import { toPublicDevice } from '../mappers';
import type { DeviceEntity, DeviceRepository } from '../types';

interface DeviceRow {
  id: string;
  installation_id: string;
  platform: DeviceEntity['platform'];
  push_token: string | null;
  language: DeviceEntity['language'];
  app_version: string;
  os_version: string | null;
  device_model: string | null;
  notification_permission: DeviceEntity['notificationPermission'];
  created_at: Date;
  last_active_at: Date;
}

const toEntity = (row: DeviceRow): DeviceEntity => ({
  id: row.id,
  installationId: row.installation_id,
  platform: row.platform,
  pushToken: row.push_token,
  language: row.language,
  appVersion: row.app_version,
  osVersion: row.os_version,
  deviceModel: row.device_model,
  notificationPermission: row.notification_permission,
  createdAt: row.created_at.toISOString(),
  lastActiveAt: row.last_active_at.toISOString(),
});

export class PgDeviceRepository implements DeviceRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsert(input: RegisterDeviceInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // A push token belongs to exactly one installation: detach it from stale records first.
      if (input.pushToken) {
        await client.query('UPDATE devices SET push_token = NULL WHERE push_token = $1 AND installation_id <> $2', [
          input.pushToken,
          input.installationId,
        ]);
      }
      const { rows } = await client.query<DeviceRow & { inserted: boolean }>(
        `INSERT INTO devices (id, installation_id, platform, push_token, language, app_version, os_version, device_model, notification_permission)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (installation_id) DO UPDATE SET
           platform = EXCLUDED.platform,
           push_token = EXCLUDED.push_token,
           language = EXCLUDED.language,
           app_version = EXCLUDED.app_version,
           os_version = EXCLUDED.os_version,
           device_model = EXCLUDED.device_model,
           notification_permission = EXCLUDED.notification_permission,
           last_active_at = now()
         RETURNING *, (xmax = 0) AS inserted`,
        [
          createId('dev'),
          input.installationId,
          input.platform,
          input.pushToken,
          input.language,
          input.appVersion,
          input.osVersion ?? null,
          input.deviceModel ?? null,
          input.notificationPermission,
        ],
      );
      await client.query('COMMIT');
      const row = rows[0]!;
      return { device: toEntity(row), created: row.inserted };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByInstallationId(installationId: string) {
    const { rows } = await this.pool.query<DeviceRow>('SELECT * FROM devices WHERE installation_id = $1', [installationId]);
    return rows[0] ? toEntity(rows[0]) : undefined;
  }

  async findByToken(token: string) {
    const { rows } = await this.pool.query<DeviceRow>('SELECT * FROM devices WHERE push_token = $1', [token]);
    return rows[0] ? toEntity(rows[0]) : undefined;
  }

  async findReachable(platform?: DevicePlatform) {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices
       WHERE push_token IS NOT NULL AND notification_permission = 'granted' AND ($1::text IS NULL OR platform = $1)`,
      [platform ?? null],
    );
    return rows.map(toEntity);
  }

  async invalidateToken(deviceId: string) {
    await this.pool.query("UPDATE devices SET push_token = NULL, notification_permission = 'denied' WHERE id = $1", [deviceId]);
  }

  async list(query: DeviceListQuery) {
    const where = `
      WHERE ($1::text IS NULL OR platform = $1)
        AND ($2::text IS NULL OR language = $2)
        AND ($3::text IS NULL OR notification_permission = $3)
        AND ($4::text IS NULL OR id ILIKE $4 OR installation_id ILIKE $4 OR device_model ILIKE $4)`;
    const params = [
      query.platform ?? null,
      query.language ?? null,
      query.permission ?? null,
      query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null,
    ];
    const count = await this.pool.query<{ total: string }>(`SELECT count(*) AS total FROM devices ${where}`, params);
    const total = Number(count.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(Math.max(1, query.page), totalPages);
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices ${where} ORDER BY last_active_at DESC LIMIT $5 OFFSET $6`,
      [...params, query.pageSize, (page - 1) * query.pageSize],
    );
    return { items: rows.map((row) => toPublicDevice(toEntity(row))), page, pageSize: query.pageSize, total, totalPages };
  }

  async countByPlatform() {
    const { rows } = await this.pool.query<{ total: string; ios: string; android: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE platform = 'ios') AS ios,
              count(*) FILTER (WHERE platform = 'android') AS android
       FROM devices`,
    );
    const row = rows[0];
    return { total: Number(row?.total ?? 0), ios: Number(row?.ios ?? 0), android: Number(row?.android ?? 0) };
  }
}
