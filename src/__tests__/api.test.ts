import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk';
import { createApp } from '../app';
import { createJsonRepositories } from '../repositories';
import type { PushProvider } from '../services/push.service';

const ADMIN_KEY = 'test-admin-key-1234567890';
const auth = { Authorization: `Bearer ${ADMIN_KEY}` };

class FakePush implements PushProvider {
  sent: ExpoPushMessage[] = [];
  failTokens = new Set<string>();

  isValidToken(token: string) {
    return /^ExponentPushToken\[.+\]$/.test(token);
  }

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    this.sent.push(...messages);
    return messages.map((message, index) =>
      this.failTokens.has(String(message.to))
        ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${this.sent.length}-${index}` },
    );
  }

  async getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
    return Object.fromEntries(ids.map((id) => [id, { status: 'ok' } as ExpoPushReceipt]));
  }
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    installationId: 'install-android-1',
    platform: 'android',
    pushToken: 'ExponentPushToken[android1]',
    language: 'en',
    appVersion: '1.0.0',
    notificationPermission: 'granted',
    ...overrides,
  };
}

describe('Beacon API', () => {
  let push: FakePush;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    push = new FakePush();
    ctx = createApp({ repositories: createJsonRepositories(null), push, adminApiKey: ADMIN_KEY, corsOrigins: [] });
  });

  it('reports health without auth', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects admin routes without a valid key', async () => {
    expect((await request(ctx.app).get('/api/devices')).status).toBe(401);
    expect((await request(ctx.app).get('/api/devices').set('Authorization', 'Bearer wrong')).status).toBe(401);
  });

  it('registers and upserts devices, masking tokens in responses', async () => {
    const first = await request(ctx.app).post('/api/devices/register').send(device());
    expect(first.status).toBe(201);
    expect(first.body.data.pushToken).not.toContain('android1]');

    const second = await request(ctx.app).post('/api/devices/register').send(device({ language: 'ar' }));
    expect(second.status).toBe(200);

    const list = await request(ctx.app).get('/api/devices').set(auth);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].language).toBe('ar');
  });

  it('validates device registration input', async () => {
    const res = await request(ctx.app).post('/api/devices/register').send(device({ pushToken: 'bad' }));
    expect(res.status).toBe(422);
    expect(res.body.error.details.pushToken).toBeDefined();
  });

  it('sends to the matching audience and builds deep link data', async () => {
    await request(ctx.app).post('/api/devices/register').send(device());
    await request(ctx.app)
      .post('/api/devices/register')
      .send(device({ installationId: 'install-ios-1', platform: 'ios', pushToken: 'ExponentPushToken[ios1]' }));

    const res = await request(ctx.app).post('/api/notifications/send').set(auth).send({
      title: 'Hello',
      body: 'World',
      destination: 'activity',
      entityId: '123',
      audience: 'ios',
      platform: 'all',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('sent');
    expect(res.body.data.targetCount).toBe(1);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]?.to).toBe('ExponentPushToken[ios1]');
    expect(push.sent[0]?.data).toMatchObject({ destination: 'activity', entityId: '123' });
  });

  it('marks notifications failed when nobody is reachable', async () => {
    const res = await request(ctx.app)
      .post('/api/notifications/send')
      .set(auth)
      .send({ title: 'x', body: 'y', destination: 'home', audience: 'all' });
    expect(res.body.data.status).toBe('failed');
  });

  it('invalidates tokens reported as DeviceNotRegistered', async () => {
    await request(ctx.app).post('/api/devices/register').send(device());
    push.failTokens.add('ExponentPushToken[android1]');
    const res = await request(ctx.app)
      .post('/api/notifications/send')
      .set(auth)
      .send({ title: 'x', body: 'y', destination: 'home', audience: 'all' });
    expect(res.body.data.status).toBe('failed');
    const list = await request(ctx.app).get('/api/devices').set(auth);
    expect(list.body.data.items[0].pushToken).toBeNull();
  });

  it('schedules, dispatches and cancels notifications', async () => {
    await request(ctx.app).post('/api/devices/register').send(device());
    const scheduledAt = new Date(Date.now() + 120_000).toISOString();
    const res = await request(ctx.app)
      .post('/api/notifications/schedule')
      .set(auth)
      .send({ title: 'Later', body: 'Soon', destination: 'home', audience: 'all', scheduledAt });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('scheduled');

    expect(await ctx.service.dispatchDue(new Date(Date.now() + 180_000))).toBe(1);
    expect(push.sent).toHaveLength(1);

    const another = await request(ctx.app)
      .post('/api/notifications/schedule')
      .set(auth)
      .send({ title: 'Later', body: 'Soon', destination: 'home', audience: 'all', scheduledAt });
    const cancel = await request(ctx.app).post(`/api/notifications/${another.body.data.id}/cancel`).set(auth);
    expect(cancel.body.data.status).toBe('cancelled');
  });

  it('counts unique opens and processes receipts', async () => {
    await request(ctx.app).post('/api/devices/register').send(device());
    const sent = await request(ctx.app)
      .post('/api/notifications/send')
      .set(auth)
      .send({ title: 'x', body: 'y', destination: 'home', audience: 'all' });
    const id = sent.body.data.id as string;

    for (let i = 0; i < 2; i += 1) {
      const res = await request(ctx.app)
        .post(`/api/notifications/${id}/events`)
        .send({ type: 'opened', installationId: 'install-android-1' });
      expect(res.status).toBe(202);
    }
    await ctx.service.processReceipts(0);

    const detail = await request(ctx.app).get(`/api/notifications/${id}`).set(auth);
    expect(detail.body.data.openedCount).toBe(1);
    expect(detail.body.data.deliveredCount).toBe(1);

    const stats = await request(ctx.app).get('/api/stats').set(auth);
    expect(stats.body.data).toMatchObject({ registeredDevices: 1, notificationsSent: 1, notificationsOpened: 1 });
  });

  it('returns JSON errors for malformed bodies and unknown routes', async () => {
    const malformed = await request(ctx.app)
      .post('/api/devices/register')
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(malformed.status).toBe(400);
    expect((await request(ctx.app).get('/api/nope').set(auth)).status).toBe(404);
  });
});
