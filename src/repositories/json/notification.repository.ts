import type { NotificationListQuery } from '@beacon/shared';
import { toPublicNotification } from '../mappers';
import { paginate } from '../paginate';
import type {
  NotificationCounter,
  NotificationEntity,
  NotificationPatch,
  NotificationRepository,
  PendingReceipt,
} from '../types';
import type { JsonStore } from './store';

export class JsonNotificationRepository implements NotificationRepository {
  constructor(private readonly store: JsonStore) {}

  async insert(entity: NotificationEntity) {
    return this.store.update((db) => {
      db.notifications.push(entity);
      return entity;
    });
  }

  async findById(id: string) {
    return this.store.state.notifications.find((notification) => notification.id === id);
  }

  async update(id: string, patch: NotificationPatch) {
    return this.store.update((db) => {
      const entity = db.notifications.find((notification) => notification.id === id);
      if (entity) Object.assign(entity, patch);
      return entity;
    });
  }

  async increment(id: string, counter: NotificationCounter, amount = 1) {
    this.store.update((db) => {
      const entity = db.notifications.find((notification) => notification.id === id);
      if (entity) entity[counter] += amount;
    });
  }

  async markOpened(id: string, installationId: string) {
    return this.store.update((db) => {
      const key = `${id}:${installationId}`;
      const entity = db.notifications.find((notification) => notification.id === id);
      if (!entity || db.opens.includes(key)) return false;
      db.opens.push(key);
      entity.openedCount += 1;
      return true;
    });
  }

  async claimDueScheduled(now: Date) {
    return this.store.update((db) =>
      db.notifications.filter((notification) => {
        const due =
          notification.status === 'scheduled' &&
          notification.scheduledAt !== null &&
          new Date(notification.scheduledAt).getTime() <= now.getTime();
        if (due) notification.status = 'sending';
        return due;
      }),
    );
  }

  async list(query: NotificationListQuery) {
    const search = query.search?.toLowerCase();
    const filtered = this.store.state.notifications
      .filter((notification) => !query.status || notification.status === query.status)
      .filter((notification) => !query.platform || notification.platform === query.platform)
      .filter(
        (notification) =>
          !search || notification.title.toLowerCase().includes(search) || notification.body.toLowerCase().includes(search),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paginate(filtered.map(toPublicNotification), query.page, query.pageSize);
  }

  async totals() {
    const notifications = this.store.state.notifications;
    return {
      sent: notifications.reduce((sum, entry) => sum + entry.sentCount, 0),
      opened: notifications.reduce((sum, entry) => sum + entry.openedCount, 0),
    };
  }

  async addPendingReceipts(receipts: PendingReceipt[]) {
    if (receipts.length === 0) return;
    this.store.update((db) => {
      db.pendingReceipts.push(...receipts);
    });
  }

  async pendingReceiptsOlderThan(ageMs: number) {
    const cutoff = Date.now() - ageMs;
    return this.store.state.pendingReceipts.filter((receipt) => new Date(receipt.createdAt).getTime() <= cutoff);
  }

  async removePendingReceipts(ticketIds: string[]) {
    const ids = new Set(ticketIds);
    this.store.update((db) => {
      db.pendingReceipts = db.pendingReceipts.filter((receipt) => !ids.has(receipt.ticketId));
    });
  }
}
