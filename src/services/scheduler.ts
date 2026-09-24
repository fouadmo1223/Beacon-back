import { logger } from '../lib/logger';
import type { NotificationService } from './notification.service';

/**
 * Polls for due scheduled notifications and pending push receipts.
 * Polling (instead of one timer per notification) survives restarts because
 * scheduled notifications are persisted in the store.
 */
export function startScheduler(
  service: NotificationService,
  options: { intervalMs: number; receiptDelayMs: number },
): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const dispatched = await service.dispatchDue();
      if (dispatched > 0) logger.info('Scheduled notifications dispatched', { count: dispatched });
      await service.processReceipts(options.receiptDelayMs);
    } catch (error) {
      logger.error('Scheduler tick failed', { error });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), options.intervalMs);
  void tick();
  return () => clearInterval(timer);
}
