import { Router, type RequestHandler } from 'express';
import { deviceListQuerySchema, registerDeviceSchema, type ApiSuccess, type DeviceRecord, type Paginated } from '@beacon/shared';
import { logger } from '../lib/logger';
import { parseOrThrow } from '../lib/validate';
import { publicLimiter } from '../middleware/security';
import { toPublicDevice } from '../repositories/mappers';
import type { DeviceRepository } from '../repositories/types';

export function devicesRouter(devices: DeviceRepository, requireAdmin: RequestHandler): Router {
  const router = Router();

  // Public: called by the mobile app on launch / token change.
  router.post('/register', publicLimiter, async (req, res) => {
    const input = parseOrThrow(registerDeviceSchema, req.body);
    const { device, created } = await devices.upsert(input);
    logger.info(created ? 'Device registered' : 'Device updated', { id: device.id, platform: device.platform });
    const body: ApiSuccess<DeviceRecord> = { data: toPublicDevice(device) };
    res.status(created ? 201 : 200).json(body);
  });

  router.get('/', requireAdmin, async (req, res) => {
    const query = parseOrThrow(deviceListQuerySchema, req.query);
    const body: ApiSuccess<Paginated<DeviceRecord>> = { data: await devices.list(query) };
    res.json(body);
  });

  return router;
}
