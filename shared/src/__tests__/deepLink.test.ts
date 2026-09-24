import { describe, expect, it } from 'vitest';
import {
  buildDeepLinkPath,
  buildNotificationPayload,
  parseDeepLinkUrl,
  parseNotificationData,
  resolveNotificationPath,
} from '../utils/deepLink';

describe('parseNotificationData', () => {
  it('parses a complete payload', () => {
    const parsed = parseNotificationData({
      notificationId: 'ntf_1',
      destination: 'activity',
      entityId: '123',
      imageUrl: 'https://cdn.example.com/a.png',
      custom: { campaign: 'spring' },
    });
    expect(parsed).toEqual({
      notificationId: 'ntf_1',
      destination: 'activity',
      entityId: '123',
      imageUrl: 'https://cdn.example.com/a.png',
      custom: { campaign: 'spring' },
    });
  });

  it('accepts numeric entity ids', () => {
    expect(parseNotificationData({ destination: 'activity', entityId: 123 }).entityId).toBe('123');
  });

  it('drops unknown destinations', () => {
    expect(parseNotificationData({ destination: 'admin-panel', entityId: '1' })).toMatchObject({
      destination: null,
      entityId: null,
    });
  });

  it('drops entity ids for destinations that do not support them', () => {
    expect(parseNotificationData({ destination: 'settings', entityId: '1' }).entityId).toBeNull();
  });

  it('rejects unsafe entity ids', () => {
    expect(parseNotificationData({ destination: 'activity', entityId: '../etc/passwd' }).entityId).toBeNull();
  });

  it('rejects non-https images', () => {
    expect(parseNotificationData({ imageUrl: 'http://insecure.example.com/a.png' }).imageUrl).toBeNull();
    expect(parseNotificationData({ imageUrl: 'javascript:alert(1)' }).imageUrl).toBeNull();
  });

  it('falls back to the url field', () => {
    expect(parseNotificationData({ url: 'beacon://notifications/abc' })).toMatchObject({
      destination: 'notifications',
      entityId: 'abc',
    });
  });

  it('never throws on garbage input', () => {
    for (const input of [null, undefined, 42, 'string', [], { custom: [1, 2] }]) {
      expect(() => parseNotificationData(input)).not.toThrow();
      expect(parseNotificationData(input).destination).toBeNull();
    }
  });
});

describe('parseDeepLinkUrl', () => {
  it.each([
    ['beacon://activity/123', { destination: 'activity', entityId: '123' }],
    ['/notifications', { destination: 'notifications', entityId: null }],
    ['settings', { destination: 'settings', entityId: null }],
    ['beacon://', { destination: 'home', entityId: null }],
    ['/(tabs)/activity', { destination: 'activity', entityId: null }],
    ['/activity/42?ref=push#top', { destination: 'activity', entityId: '42' }],
  ])('parses %s', (url, expected) => {
    expect(parseDeepLinkUrl(url)).toEqual(expected);
  });

  it.each([
    'https://evil.example.com/activity',
    'javascript:alert(1)',
    'other-app://activity/1',
    '/unknown',
    '/activity/1/extra',
    '/settings/1',
    '/activity/%E0%A4%A',
    '',
    null,
  ])('rejects %s', (url) => {
    expect(parseDeepLinkUrl(url)).toBeNull();
  });
});

describe('buildDeepLinkPath', () => {
  it('maps every destination to a route', () => {
    expect(buildDeepLinkPath('home')).toBe('/');
    expect(buildDeepLinkPath('activity')).toBe('/activity');
    expect(buildDeepLinkPath('activity', '123')).toBe('/activity/123');
    expect(buildDeepLinkPath('notifications', 'n-1')).toBe('/notifications/n-1');
    expect(buildDeepLinkPath('settings', 'ignored')).toBe('/settings');
    expect(buildDeepLinkPath('camera')).toBe('/camera');
  });

  it('ignores invalid entity ids', () => {
    expect(buildDeepLinkPath('activity', 'a/b')).toBe('/activity');
  });
});

describe('resolveNotificationPath', () => {
  it('returns null when there is no valid destination', () => {
    expect(resolveNotificationPath({ destination: 'nope' })).toBeNull();
  });

  it('resolves a valid payload', () => {
    expect(resolveNotificationPath({ destination: 'activity', entityId: '123' })).toBe('/activity/123');
  });
});

describe('buildNotificationPayload', () => {
  it('omits empty optional fields', () => {
    expect(buildNotificationPayload({ notificationId: 'n1', destination: 'home', custom: {} })).toEqual({
      notificationId: 'n1',
      destination: 'home',
    });
  });

  it('round-trips through the parser', () => {
    const payload = buildNotificationPayload({
      notificationId: 'n1',
      destination: 'activity',
      entityId: '9',
      custom: { a: 1 },
    });
    expect(parseNotificationData(payload)).toMatchObject({ destination: 'activity', entityId: '9', custom: { a: 1 } });
  });
});
