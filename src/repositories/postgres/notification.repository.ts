import type pg from 'pg';
import type { JsonObject, NotificationListQuery } from '@beacon/shared';
import { toPublicNotification } from '../mappers';
import type {
  NotificationCounter,
  NotificationEntity,
  NotificationPatch,
  NotificationRepository,
  PendingReceipt,
} from '../types';

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  destination: NotificationEntity['destination'];
  entity_id: string | null;
  data: JsonObject | null;
  audience: NotificationEntity['audience'];
  platform: NotificationEntity['platform'];
  device_token: string | null;
  target_token: string | null;
  status: NotificationEntity['status'];
  scheduled_at: Date | null;
  sent_at: Date | null;
  created_at: Date;
  target_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  opened_count: number;
  error_message: string | null;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

const toEntity = (row: NotificationRow): NotificationEntity => ({
  id: row.id,
  title: row.title,
  body: row.body,
  imageUrl: row.image_url,
  destination: row.destination,
  entityId: row.entity_id,
  data: row.data,
  audience: row.audience,
  platform: row.platform,
  deviceToken: row.device_token,
  targetToken: row.target_token,
  status: row.status,
  scheduledAt: iso(row.scheduled_at),
  sentAt: iso(row.sent_at),
  createdAt: row.created_at.toISOString(),
  targetCount: row.target_count,
  sentCount: row.sent_count,
  deliveredCount: row.delivered_count,
  failedCount: row.failed_count,
  openedCount: row.opened_count,
  errorMessage: row.error_message,
});

/** Entity field → column. Only these fields can be patched (keeps SQL built from a fixed whitelist). */
const COLUMNS: Partial<Record<keyof NotificationEntity, string>> = {
  title: 'title',
  body: 'body',
  imageUrl: 'image_url',
  destination: 'destination',
  entityId: 'entity_id',
  data: 'data',
  audience: 'audience',
  platform: 'platform',
  deviceToken: 'device_token',
  targetToken: 'target_token',
  status: 'status',
  scheduledAt: 'scheduled_at',
  sentAt: 'sent_at',
  targetCount: 'target_count',
  sentCount: 'sent_count',
  deliveredCount: 'delivered_count',
  failedCount: 'failed_count',
  openedCount: 'opened_count',
  errorMessage: 'error_message',
};

const COUNTER_COLUMNS: Record<NotificationCounter, string> = {
  deliveredCount: 'delivered_count',
  failedCount: 'failed_count',
};

export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(entity: NotificationEntity) {
    const { rows } = await this.pool.query<NotificationRow>(
      `INSERT INTO notifications (id, title, body, image_url, destination, entity_id, data, audience, platform, device_token,
         target_token, status, scheduled_at, sent_at, created_at, target_count, sent_count, delivered_count, failed_count,
         opened_count, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        entity.id,
        entity.title,
        entity.body,
        entity.imageUrl,
        entity.destination,
        entity.entityId,
        entity.data === null ? null : JSON.stringify(entity.data),
        entity.audience,
        entity.platform,
        entity.deviceToken,
        entity.targetToken,
        entity.status,
        entity.scheduledAt,
        entity.sentAt,
        entity.createdAt,
        entity.targetCount,
        entity.sentCount,
        entity.deliveredCount,
        entity.failedCount,
        entity.openedCount,
        entity.errorMessage,
      ],
    );
    return toEntity(rows[0]!);
  }

  async findById(id: string) {
    const { rows } = await this.pool.query<NotificationRow>('SELECT * FROM notifications WHERE id = $1', [id]);
    return rows[0] ? toEntity(rows[0]) : undefined;
  }

  async update(id: string, patch: NotificationPatch) {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(patch) as [keyof NotificationEntity, unknown][]) {
      const column = COLUMNS[key];
      if (!column || value === undefined) continue;
      values.push(key === 'data' && value !== null ? JSON.stringify(value) : value);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return this.findById(id);
    values.push(id);
    const { rows } = await this.pool.query<NotificationRow>(
      `UPDATE notifications SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] ? toEntity(rows[0]) : undefined;
  }

  async increment(id: string, counter: NotificationCounter, amount = 1) {
    const column = COUNTER_COLUMNS[counter];
    await this.pool.query(`UPDATE notifications SET ${column} = ${column} + $1 WHERE id = $2`, [amount, id]);
  }

  async markOpened(id: string, installationId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO notification_opens (notification_id, installation_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM notifications WHERE id = $1)
         ON CONFLICT DO NOTHING`,
        [id, installationId],
      );
      const isNew = (inserted.rowCount ?? 0) > 0;
      if (isNew) await client.query('UPDATE notifications SET opened_count = opened_count + 1 WHERE id = $1', [id]);
      await client.query('COMMIT');
      return isNew;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDueScheduled(now: Date) {
    const { rows } = await this.pool.query<NotificationRow>(
      `UPDATE notifications SET status = 'sending'
       WHERE id IN (
         SELECT id FROM notifications
         WHERE status = 'scheduled' AND scheduled_at <= $1
         ORDER BY scheduled_at
         FOR UPDATE SKIP LOCKED
         LIMIT 50
       )
       RETURNING *`,
      [now.toISOString()],
    );
    return rows.map(toEntity);
  }

  async list(query: NotificationListQuery) {
    const where = `
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR platform = $2)
        AND ($3::text IS NULL OR title ILIKE $3 OR body ILIKE $3)`;
    const params = [
      query.status ?? null,
      query.platform ?? null,
      query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : null,
    ];
    const count = await this.pool.query<{ total: string }>(`SELECT count(*) AS total FROM notifications ${where}`, params);
    const total = Number(count.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(Math.max(1, query.page), totalPages);
    const { rows } = await this.pool.query<NotificationRow>(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
      [...params, query.pageSize, (page - 1) * query.pageSize],
    );
    return {
      items: rows.map((row) => toPublicNotification(toEntity(row))),
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    };
  }

  async totals() {
    const { rows } = await this.pool.query<{ sent: string | null; opened: string | null }>(
      'SELECT sum(sent_count) AS sent, sum(opened_count) AS opened FROM notifications',
    );
    return { sent: Number(rows[0]?.sent ?? 0), opened: Number(rows[0]?.opened ?? 0) };
  }

  async addPendingReceipts(receipts: PendingReceipt[]) {
    if (receipts.length === 0) return;
    const values: unknown[] = [];
    const tuples = receipts.map((receipt, index) => {
      values.push(receipt.ticketId, receipt.notificationId, receipt.deviceId, receipt.createdAt);
      const base = index * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await this.pool.query(
      `INSERT INTO push_receipts (ticket_id, notification_id, device_id, created_at) VALUES ${tuples.join(', ')}
       ON CONFLICT (ticket_id) DO NOTHING`,
      values,
    );
  }

  async pendingReceiptsOlderThan(ageMs: number) {
    const { rows } = await this.pool.query<{ ticket_id: string; notification_id: string; device_id: string | null; created_at: Date }>(
      'SELECT * FROM push_receipts WHERE created_at <= $1 ORDER BY created_at LIMIT 1000',
      [new Date(Date.now() - ageMs).toISOString()],
    );
    return rows.map((row) => ({
      ticketId: row.ticket_id,
      notificationId: row.notification_id,
      deviceId: row.device_id,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async removePendingReceipts(ticketIds: string[]) {
    if (ticketIds.length === 0) return;
    await this.pool.query('DELETE FROM push_receipts WHERE ticket_id = ANY($1::text[])', [ticketIds]);
  }
}
