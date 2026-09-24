import type {
  DeviceListQuery,
  DevicePlatform,
  DeviceRecord,
  NotificationListQuery,
  NotificationRecord,
  Paginated,
  RegisterDeviceInput,
} from '@beacon/shared';

/** Device as stored — `pushToken` is kept in full and only masked on the way out. */
export type DeviceEntity = DeviceRecord;

export interface NotificationEntity extends NotificationRecord {
  /** Full target token for `device` audience (the public record only exposes a masked copy). */
  targetToken: string | null;
}

export interface PendingReceipt {
  ticketId: string;
  notificationId: string;
  deviceId: string | null;
  createdAt: string;
}

export type NotificationCounter = 'deliveredCount' | 'failedCount';
export type NotificationPatch = Partial<Omit<NotificationEntity, 'id' | 'createdAt'>>;

/**
 * Persistence contracts. Two implementations exist:
 *  - `repositories/json/*`     — JSON file / in-memory (local dev without a DB, tests)
 *  - `repositories/postgres/*` — PostgreSQL (Neon) for production
 */
export interface DeviceRepository {
  upsert(input: RegisterDeviceInput): Promise<{ device: DeviceEntity; created: boolean }>;
  findByInstallationId(installationId: string): Promise<DeviceEntity | undefined>;
  findByToken(token: string): Promise<DeviceEntity | undefined>;
  /** Devices that can receive a push right now. */
  findReachable(platform?: DevicePlatform): Promise<DeviceEntity[]>;
  invalidateToken(deviceId: string): Promise<void>;
  list(query: DeviceListQuery): Promise<Paginated<DeviceRecord>>;
  countByPlatform(): Promise<{ total: number; ios: number; android: number }>;
}

export interface NotificationRepository {
  insert(entity: NotificationEntity): Promise<NotificationEntity>;
  findById(id: string): Promise<NotificationEntity | undefined>;
  update(id: string, patch: NotificationPatch): Promise<NotificationEntity | undefined>;
  increment(id: string, counter: NotificationCounter, amount?: number): Promise<void>;
  /** Records a unique open; returns false when this installation already opened it. */
  markOpened(id: string, installationId: string): Promise<boolean>;
  /**
   * Atomically moves due `scheduled` notifications to `sending` and returns them,
   * so concurrent server instances never dispatch the same notification twice.
   */
  claimDueScheduled(now: Date): Promise<NotificationEntity[]>;
  list(query: NotificationListQuery): Promise<Paginated<NotificationRecord>>;
  totals(): Promise<{ sent: number; opened: number }>;

  addPendingReceipts(receipts: PendingReceipt[]): Promise<void>;
  pendingReceiptsOlderThan(ageMs: number): Promise<PendingReceipt[]>;
  removePendingReceipts(ticketIds: string[]): Promise<void>;
}

export interface Repositories {
  devices: DeviceRepository;
  notifications: NotificationRepository;
  close(): Promise<void>;
}
