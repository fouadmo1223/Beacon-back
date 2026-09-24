import { createId, type DeviceListQuery, type DevicePlatform, type RegisterDeviceInput } from '@beacon/shared';
import { paginate } from '../paginate';
import { toPublicDevice } from '../mappers';
import type { DeviceEntity, DeviceRepository } from '../types';
import type { JsonStore } from './store';

export class JsonDeviceRepository implements DeviceRepository {
  constructor(private readonly store: JsonStore) {}

  async upsert(input: RegisterDeviceInput) {
    return this.store.update((db) => {
      const now = new Date().toISOString();
      const existing = db.devices.find((device) => device.installationId === input.installationId);
      const fields = {
        platform: input.platform,
        pushToken: input.pushToken,
        language: input.language,
        appVersion: input.appVersion,
        osVersion: input.osVersion ?? null,
        deviceModel: input.deviceModel ?? null,
        notificationPermission: input.notificationPermission,
        lastActiveAt: now,
      };

      // A push token belongs to exactly one installation: detach it from stale records.
      if (input.pushToken) {
        for (const device of db.devices) {
          if (device.pushToken === input.pushToken && device.installationId !== input.installationId) {
            device.pushToken = null;
          }
        }
      }

      if (existing) {
        Object.assign(existing, fields);
        return { device: existing, created: false };
      }
      const device: DeviceEntity = { id: createId('dev'), installationId: input.installationId, createdAt: now, ...fields };
      db.devices.push(device);
      return { device, created: true };
    });
  }

  async findByInstallationId(installationId: string) {
    return this.store.state.devices.find((device) => device.installationId === installationId);
  }

  async findByToken(token: string) {
    return this.store.state.devices.find((device) => device.pushToken === token);
  }

  async findReachable(platform?: DevicePlatform) {
    return this.store.state.devices.filter(
      (device) =>
        device.pushToken !== null && device.notificationPermission === 'granted' && (!platform || device.platform === platform),
    );
  }

  async invalidateToken(deviceId: string) {
    this.store.update((db) => {
      const device = db.devices.find((entry) => entry.id === deviceId);
      if (device) {
        device.pushToken = null;
        device.notificationPermission = 'denied';
      }
    });
  }

  async list(query: DeviceListQuery) {
    const search = query.search?.toLowerCase();
    const filtered = this.store.state.devices
      .filter((device) => !query.platform || device.platform === query.platform)
      .filter((device) => !query.language || device.language === query.language)
      .filter((device) => !query.permission || device.notificationPermission === query.permission)
      .filter(
        (device) =>
          !search ||
          device.id.toLowerCase().includes(search) ||
          device.installationId.toLowerCase().includes(search) ||
          (device.deviceModel ?? '').toLowerCase().includes(search),
      )
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
    return paginate(filtered.map(toPublicDevice), query.page, query.pageSize);
  }

  async countByPlatform() {
    const devices = this.store.state.devices;
    return {
      total: devices.length,
      ios: devices.filter((device) => device.platform === 'ios').length,
      android: devices.filter((device) => device.platform === 'android').length,
    };
  }
}
