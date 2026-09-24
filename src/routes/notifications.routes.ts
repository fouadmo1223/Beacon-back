import { Router, type RequestHandler } from 'express';
import {
  entityIdSchema,
  notificationEventSchema,
  notificationListQuerySchema,
  scheduleNotificationSchema,
  sendNotificationSchema,
  type ApiSuccess,
  type NotificationRecord,
  type Paginated,
} from '@beacon/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { parseOrThrow } from '../lib/validate';
import { publicLimiter } from '../middleware/security';
import { toPublicNotification } from '../repositories/mappers';
import type { NotificationRepository } from '../repositories/types';
import type { NotificationService } from '../services/notification.service';

const idParamsSchema = z.object({ id: entityIdSchema });

export function notificationsRouter(
  repository: NotificationRepository,
  service: NotificationService,
  requireAdmin: RequestHandler,
): Router {
  const router = Router();

  // Public: the app reports "opened" events so the dashboard can show open rates.
  router.post('/:id/events', publicLimiter, async (req, res) => {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    await service.recordEvent(id, parseOrThrow(notificationEventSchema, req.body));
    res.status(202).json({ data: { accepted: true } });
  });

  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    const query = parseOrThrow(notificationListQuerySchema, req.query);
    const body: ApiSuccess<Paginated<NotificationRecord>> = { data: await repository.list(query) };
    res.json(body);
  });

  router.get('/:id', async (req, res) => {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const entity = await repository.findById(id);
    if (!entity) throw HttpError.notFound('Notification not found');
    res.json({ data: toPublicNotification(entity) } satisfies ApiSuccess<NotificationRecord>);
  });

  router.post('/send', async (req, res) => {
    const input = parseOrThrow(sendNotificationSchema, req.body);
    const entity = await service.sendNow(input);
    res.status(201).json({ data: toPublicNotification(entity) } satisfies ApiSuccess<NotificationRecord>);
  });

  router.post('/schedule', async (req, res) => {
    const input = parseOrThrow(scheduleNotificationSchema, req.body);
    const entity = await service.schedule(input);
    res.status(201).json({ data: toPublicNotification(entity) } satisfies ApiSuccess<NotificationRecord>);
  });

  router.post('/:id/cancel', async (req, res) => {
    const { id } = parseOrThrow(idParamsSchema, req.params);
    res.json({ data: toPublicNotification(await service.cancel(id)) } satisfies ApiSuccess<NotificationRecord>);
  });

  return router;
}
