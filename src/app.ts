import express from 'express';
import { API_ROUTES, type ApiSuccess, type OverviewStats } from '@beacon/shared';
import { errorHandler, notFoundHandler } from './lib/errors';
import { requireAdmin } from './middleware/auth';
import { adminLimiter, securityMiddleware } from './middleware/security';
import type { Repositories } from './repositories/types';
import { devicesRouter } from './routes/devices.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { NotificationService } from './services/notification.service';
import type { PushProvider } from './services/push.service';

export interface AppOptions {
  repositories: Repositories;
  push: PushProvider;
  adminApiKey: string;
  corsOrigins: string[];
  trustProxy?: boolean;
}

export function createApp(options: AppOptions) {
  const { devices, notifications } = options.repositories;
  const service = new NotificationService(notifications, devices, options.push);
  const admin = requireAdmin(options.adminApiKey);

  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);

  app.use(...securityMiddleware(options.corsOrigins));
  app.use(express.json({ limit: '32kb' }));

  app.get(API_ROUTES.health, (_req, res) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });

  app.use('/api', adminLimiter);
  app.use(API_ROUTES.devices, devicesRouter(devices, admin));
  app.use(API_ROUTES.notifications, notificationsRouter(notifications, service, admin));
  app.get(API_ROUTES.stats, admin, async (_req, res) => {
    res.json({ data: await service.stats() } satisfies ApiSuccess<OverviewStats>);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, service };
}
