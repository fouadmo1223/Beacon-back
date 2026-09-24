import { maskToken, type DeviceRecord, type NotificationRecord } from '@beacon/shared';
import type { DeviceEntity, NotificationEntity } from './types';

/** Never expose full push tokens through the API. */
export function toPublicDevice(device: DeviceEntity): DeviceRecord {
  return { ...device, pushToken: maskToken(device.pushToken) };
}

export function toPublicNotification(entity: NotificationEntity): NotificationRecord {
  const { targetToken: _targetToken, ...record } = entity;
  return record;
}
