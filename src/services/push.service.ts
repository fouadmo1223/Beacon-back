import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';
import { logger } from '../lib/logger';

/** Abstraction over the Expo push service so it can be faked in tests. */
export interface PushProvider {
  isValidToken(token: string): boolean;
  /** Sends messages (any size) and returns one ticket per message, in order. */
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

export class ExpoPushProvider implements PushProvider {
  private readonly expo: Expo;

  constructor(accessToken?: string) {
    // The access token only lives on the server — never in the dashboard or app.
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  isValidToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      } catch (error) {
        logger.error('Expo push request failed', { error });
        const message = error instanceof Error ? error.message : 'Push request failed';
        tickets.push(...chunk.map((): ExpoPushTicket => ({ status: 'error', message })));
      }
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const receipts: Record<string, ExpoPushReceipt> = {};
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(ticketIds)) {
      try {
        Object.assign(receipts, await this.expo.getPushNotificationReceiptsAsync(chunk));
      } catch (error) {
        logger.error('Fetching push receipts failed', { error });
      }
    }
    return receipts;
  }
}
