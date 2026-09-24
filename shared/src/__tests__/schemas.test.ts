import { describe, expect, it } from 'vitest';
import {
  flattenZodIssues,
  registerDeviceSchema,
  scheduleNotificationSchema,
  sendNotificationSchema,
} from '../schemas';
import { hexToRgbChannels, paletteToCssVariables, palettes } from '../brand/tokens';
import { maskToken } from '../utils/format';

const validNotification = {
  title: 'New update available',
  body: 'Tap to see what changed.',
  destination: 'notifications',
  audience: 'all',
  platform: 'all',
} as const;

describe('sendNotificationSchema', () => {
  it('accepts a minimal notification', () => {
    const result = sendNotificationSchema.safeParse(validNotification);
    expect(result.success).toBe(true);
  });

  it('trims and requires title/body', () => {
    const result = sendNotificationSchema.safeParse({ ...validNotification, title: '   ', body: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = flattenZodIssues(result.error);
      expect(Object.keys(issues)).toEqual(expect.arrayContaining(['title', 'body']));
    }
  });

  it('rejects unknown destinations', () => {
    expect(sendNotificationSchema.safeParse({ ...validNotification, destination: 'admin' }).success).toBe(false);
  });

  it('requires a token for the device audience', () => {
    const missing = sendNotificationSchema.safeParse({ ...validNotification, audience: 'device' });
    expect(missing.success).toBe(false);
    const ok = sendNotificationSchema.safeParse({
      ...validNotification,
      audience: 'device',
      deviceToken: 'ExponentPushToken[abc123]',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects malformed tokens', () => {
    const result = sendNotificationSchema.safeParse({
      ...validNotification,
      audience: 'device',
      deviceToken: 'not-a-token',
    });
    expect(result.success).toBe(false);
  });

  it('rejects conflicting platform and audience', () => {
    const result = sendNotificationSchema.safeParse({ ...validNotification, audience: 'ios', platform: 'android' });
    expect(result.success).toBe(false);
  });

  it('only accepts https images', () => {
    expect(sendNotificationSchema.safeParse({ ...validNotification, imageUrl: 'http://x.com/a.png' }).success).toBe(
      false,
    );
    expect(sendNotificationSchema.safeParse({ ...validNotification, imageUrl: 'https://x.com/a.png' }).success).toBe(
      true,
    );
  });

  it('validates entity ids and custom data', () => {
    expect(sendNotificationSchema.safeParse({ ...validNotification, entityId: 'a b' }).success).toBe(false);
    expect(sendNotificationSchema.safeParse({ ...validNotification, data: { big: 'x'.repeat(5000) } }).success).toBe(
      false,
    );
    expect(sendNotificationSchema.safeParse({ ...validNotification, data: { nested: { ok: [1, true] } } }).success).toBe(
      true,
    );
  });
});

describe('scheduleNotificationSchema', () => {
  it('requires a future date', () => {
    const past = scheduleNotificationSchema.safeParse({
      ...validNotification,
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.success).toBe(false);

    const future = scheduleNotificationSchema.safeParse({
      ...validNotification,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(future.success).toBe(true);
  });
});

describe('registerDeviceSchema', () => {
  const device = {
    installationId: 'a1b2c3d4-e5f6',
    platform: 'android',
    pushToken: 'ExponentPushToken[xyz]',
    language: 'ar',
    appVersion: '1.0.0',
    notificationPermission: 'granted',
  };

  it('accepts a valid device', () => {
    expect(registerDeviceSchema.safeParse(device).success).toBe(true);
  });

  it('allows a null token (permission denied)', () => {
    expect(registerDeviceSchema.safeParse({ ...device, pushToken: null, notificationPermission: 'denied' }).success).toBe(
      true,
    );
  });

  it('rejects unsupported platforms/languages', () => {
    expect(registerDeviceSchema.safeParse({ ...device, platform: 'web' }).success).toBe(false);
    expect(registerDeviceSchema.safeParse({ ...device, language: 'fr' }).success).toBe(false);
  });
});

describe('brand + formatting helpers', () => {
  it('converts hex colors to channels', () => {
    expect(hexToRgbChannels('#5046E4')).toBe('80 70 228');
    expect(hexToRgbChannels('#fff')).toBe('255 255 255');
    expect(() => hexToRgbChannels('#zzz')).toThrow();
  });

  it('exposes every token as a css variable', () => {
    const vars = paletteToCssVariables(palettes.dark);
    expect(vars['--color-primary']).toBe(hexToRgbChannels(palettes.dark.primary));
  });

  it('masks push tokens', () => {
    expect(maskToken('ExponentPushToken[abcdefghijklmnop]')).toBe('ExponentPushToken[abcd…mnop]');
    expect(maskToken(null)).toBeNull();
  });
});
