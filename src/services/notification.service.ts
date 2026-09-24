import type { ExpoPushMessage } from 'expo-server-sdk';
import {
  ANDROID_CHANNEL_ID,
  buildNotificationPayload,
  createId,
  maskToken,
  percentage,
  type DevicePlatform,
  type NotificationEventInput,
  type NotificationStatus,
  type OverviewStats,
  type ScheduleNotificationInput,
  type SendNotificationInput,
} from '@beacon/shared';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import type { DeviceRepository, NotificationEntity, NotificationRepository, PendingReceipt } from '../repositories/types';
import type { PushProvider } from './push.service';

interface Target {
  token: string;
  deviceId: string | null;
}

export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly devices: DeviceRepository,
    private readonly push: PushProvider,
  ) {}

  async sendNow(input: SendNotificationInput): Promise<NotificationEntity> {
    const entity = await this.notifications.insert(this.createEntity(input, 'sending', null));
    return this.dispatch(entity);
  }

  schedule(input: ScheduleNotificationInput): Promise<NotificationEntity> {
    return this.notifications.insert(this.createEntity(input, 'scheduled', input.scheduledAt));
  }

  async cancel(id: string): Promise<NotificationEntity> {
    const entity = await this.notifications.findById(id);
    if (!entity) throw HttpError.notFound('Notification not found');
    if (entity.status !== 'scheduled') throw HttpError.conflict('Only scheduled notifications can be cancelled');
    return (await this.notifications.update(id, { status: 'cancelled' })) ?? entity;
  }

  /** Called by the scheduler: claims due scheduled notifications (atomically) and sends them. */
  async dispatchDue(now = new Date()): Promise<number> {
    const due = await this.notifications.claimDueScheduled(now);
    for (const entity of due) await this.dispatch(entity);
    return due.length;
  }

  async recordEvent(notificationId: string, event: NotificationEventInput): Promise<void> {
    // Unknown ids are ignored silently: the endpoint is public and must not leak existence.
    const [entity, device] = await Promise.all([
      this.notifications.findById(notificationId),
      this.devices.findByInstallationId(event.installationId),
    ]);
    if (!entity || !device) return;
    if (event.type === 'opened') await this.notifications.markOpened(notificationId, event.installationId);
  }

  /** Reads Expo push receipts for tickets older than `delayMs` and updates counters. */
  async processReceipts(delayMs: number): Promise<number> {
    const pending = await this.notifications.pendingReceiptsOlderThan(delayMs);
    if (pending.length === 0) return 0;

    const receipts = await this.push.getReceipts(pending.map((entry) => entry.ticketId));
    const processed: string[] = [];
    for (const entry of pending) {
      const receipt = receipts[entry.ticketId];
      if (!receipt) {
        // Receipts expire after 24h; drop entries that will never resolve.
        if (Date.now() - new Date(entry.createdAt).getTime() > 24 * 3_600_000) processed.push(entry.ticketId);
        continue;
      }
      processed.push(entry.ticketId);
      if (receipt.status === 'ok') {
        await this.notifications.increment(entry.notificationId, 'deliveredCount');
      } else {
        await this.notifications.increment(entry.notificationId, 'failedCount');
        if (receipt.details?.error === 'DeviceNotRegistered' && entry.deviceId) {
          await this.devices.invalidateToken(entry.deviceId);
        }
        logger.warn('Push receipt error', { notificationId: entry.notificationId, error: receipt.details?.error });
      }
    }
    await this.notifications.removePendingReceipts(processed);
    return processed.length;
  }

  async stats(): Promise<OverviewStats> {
    const [devices, totals] = await Promise.all([this.devices.countByPlatform(), this.notifications.totals()]);
    return {
      registeredDevices: devices.total,
      androidDevices: devices.android,
      iosDevices: devices.ios,
      notificationsSent: totals.sent,
      notificationsOpened: totals.opened,
      openRate: percentage(totals.opened, totals.sent),
    };
  }

  /* ---------------------------------------------------------------- internals */

  private createEntity(input: SendNotificationInput, status: NotificationStatus, scheduledAt: string | null): NotificationEntity {
    const platform = input.audience === 'ios' || input.audience === 'android' ? input.audience : (input.platform ?? 'all');
    return {
      id: createId('ntf'),
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      destination: input.destination,
      entityId: input.entityId ?? null,
      data: input.data ?? null,
      audience: input.audience,
      platform,
      deviceToken: maskToken(input.deviceToken),
      targetToken: input.audience === 'device' ? (input.deviceToken ?? null) : null,
      status,
      scheduledAt,
      sentAt: null,
      createdAt: new Date().toISOString(),
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      openedCount: 0,
      errorMessage: null,
    };
  }

  private async resolveTargets(entity: NotificationEntity): Promise<Target[]> {
    const platformFilter: DevicePlatform | undefined = entity.platform === 'all' ? undefined : entity.platform;

    if (entity.audience === 'device') {
      if (!entity.targetToken || !this.push.isValidToken(entity.targetToken)) return [];
      const device = await this.devices.findByToken(entity.targetToken);
      if (device && platformFilter && device.platform !== platformFilter) return [];
      return [{ token: entity.targetToken, deviceId: device?.id ?? null }];
    }

    const reachable = await this.devices.findReachable(platformFilter);
    return reachable.flatMap((device) =>
      device.pushToken && this.push.isValidToken(device.pushToken) ? [{ token: device.pushToken, deviceId: device.id }] : [],
    );
  }

  private buildMessage(entity: NotificationEntity, token: string): ExpoPushMessage {
    const data = buildNotificationPayload({
      notificationId: entity.id,
      destination: entity.destination,
      entityId: entity.entityId,
      imageUrl: entity.imageUrl,
      custom: entity.data,
    });
    return {
      to: token,
      title: entity.title,
      body: entity.body,
      data: { ...data },
      sound: 'default',
      priority: 'high',
      channelId: ANDROID_CHANNEL_ID,
      ...(entity.imageUrl ? { richContent: { image: entity.imageUrl }, mutableContent: true } : {}),
    };
  }

  private async dispatch(entity: NotificationEntity): Promise<NotificationEntity> {
    const targets = await this.resolveTargets(entity);
    if (targets.length === 0) {
      return (
        (await this.notifications.update(entity.id, {
          status: 'failed',
          sentAt: new Date().toISOString(),
          errorMessage: 'No reachable devices match this audience',
        })) ?? entity
      );
    }

    const tickets = await this.push.send(targets.map((target) => this.buildMessage(entity, target.token)));
    const now = new Date().toISOString();
    const pending: PendingReceipt[] = [];
    const invalidDevices: string[] = [];
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;

    tickets.forEach((ticket, index) => {
      const target = targets[index];
      if (ticket.status === 'ok') {
        sent += 1;
        pending.push({ ticketId: ticket.id, notificationId: entity.id, deviceId: target?.deviceId ?? null, createdAt: now });
        return;
      }
      failed += 1;
      lastError = ticket.details?.error ?? ticket.message;
      if (ticket.details?.error === 'DeviceNotRegistered' && target?.deviceId) invalidDevices.push(target.deviceId);
    });

    await Promise.all(invalidDevices.map((deviceId) => this.devices.invalidateToken(deviceId)));
    await this.notifications.addPendingReceipts(pending);
    const status: NotificationStatus = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
    logger.info('Notification dispatched', { id: entity.id, targets: targets.length, sent, failed });

    return (
      (await this.notifications.update(entity.id, {
        status,
        sentAt: now,
        targetCount: targets.length,
        sentCount: sent,
        failedCount: failed,
        errorMessage: lastError,
      })) ?? entity
    );
  }
}
