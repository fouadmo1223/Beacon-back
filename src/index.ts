import { loadEnv } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { createRepositories } from './repositories';
import { ExpoPushProvider } from './services/push.service';
import { startScheduler } from './services/scheduler';

async function main() {
  const env = loadEnv();
  logger.setLevel(env.LOG_LEVEL);

  const repositories = await createRepositories({ databaseUrl: env.DATABASE_URL, dataFile: env.DATA_FILE });
  const { app, service } = createApp({
    repositories,
    push: new ExpoPushProvider(env.EXPO_ACCESS_TOKEN),
    adminApiKey: env.ADMIN_API_KEY,
    corsOrigins: env.CORS_ORIGINS,
    trustProxy: env.TRUST_PROXY,
  });

  const stopScheduler = startScheduler(service, {
    intervalMs: env.SCHEDULER_INTERVAL_MS,
    receiptDelayMs: env.RECEIPT_CHECK_DELAY_MS,
  });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`Beacon server listening on http://${env.HOST}:${env.PORT}`, { env: env.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    stopScheduler();
    server.close(() => {
      void repositories.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
