export const DESTINATIONS = ['home', 'activity', 'notifications', 'settings', 'camera'] as const;
export type Destination = (typeof DESTINATIONS)[number];

/** Destinations that accept an optional entity id (e.g. activity/123). */
export const DESTINATIONS_WITH_ENTITY: readonly Destination[] = ['activity', 'notifications'];

export const PLATFORMS = ['ios', 'android'] as const;
export type DevicePlatform = (typeof PLATFORMS)[number];

export const PLATFORM_FILTERS = ['all', 'ios', 'android'] as const;
export type PlatformFilter = (typeof PLATFORM_FILTERS)[number];

export const AUDIENCES = ['all', 'android', 'ios', 'device'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];
export const RTL_LANGUAGES: readonly Language[] = ['ar'];

export const PERMISSION_STATES = ['granted', 'denied', 'blocked', 'undetermined', 'unavailable'] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

export const NOTIFICATION_STATUSES = ['scheduled', 'sending', 'sent', 'partial', 'failed', 'cancelled'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SEND_MODES = ['now', 'schedule'] as const;
export type SendMode = (typeof SEND_MODES)[number];

export const NOTIFICATION_EVENT_TYPES = ['received', 'opened'] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Android notification channel used for all remote & local notifications. */
export const ANDROID_CHANNEL_ID = 'default';

/** URL scheme registered by the mobile app (see apps/mobile/app.config.ts). */
export const APP_SCHEME = 'beacon';

export const LIMITS = {
  titleMax: 65,
  bodyMax: 240,
  entityIdMax: 64,
  customDataMaxBytes: 2048,
  pageSizeMax: 100,
} as const;

export const API_ROUTES = {
  health: '/api/health',
  stats: '/api/stats',
  devices: '/api/devices',
  registerDevice: '/api/devices/register',
  notifications: '/api/notifications',
  sendNotification: '/api/notifications/send',
  scheduleNotification: '/api/notifications/schedule',
  notificationEvents: (id: string) => `/api/notifications/${encodeURIComponent(id)}/events`,
  cancelNotification: (id: string) => `/api/notifications/${encodeURIComponent(id)}/cancel`,
} as const;

export const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
export const ENTITY_ID_REGEX = /^[A-Za-z0-9_-]+$/;
