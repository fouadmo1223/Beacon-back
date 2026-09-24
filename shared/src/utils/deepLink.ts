import {
  APP_SCHEME,
  DESTINATIONS,
  DESTINATIONS_WITH_ENTITY,
  ENTITY_ID_REGEX,
  LIMITS,
  type Destination,
} from '../constants';
import type { JsonObject, NotificationPayloadData } from '../types';

export interface ParsedNotificationData {
  notificationId: string | null;
  destination: Destination | null;
  entityId: string | null;
  imageUrl: string | null;
  custom: JsonObject;
}

export interface DeepLinkTarget {
  destination: Destination;
  entityId: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, max = 256): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

export function isDestination(value: unknown): value is Destination {
  return typeof value === 'string' && (DESTINATIONS as readonly string[]).includes(value);
}

export function isValidEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIMITS.entityIdMax && ENTITY_ID_REGEX.test(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parses a URL-ish deep link such as `beacon://activity/123`, `/notifications/abc`
 * or `activity`. Returns `null` for anything that does not map to a known screen.
 */
export function parseDeepLinkUrl(url: unknown): DeepLinkTarget | null {
  const raw = asNonEmptyString(url, 512);
  if (!raw) return null;

  let path = raw;
  const schemePrefix = `${APP_SCHEME}://`;
  if (path.toLowerCase().startsWith(schemePrefix)) {
    path = path.slice(schemePrefix.length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    // Foreign scheme (http:, javascript:, other-app://) — never navigate.
    return null;
  }

  path = path.split(/[?#]/)[0] ?? '';
  const segments = path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment));

  if (segments.length === 0) return { destination: 'home', entityId: null };

  const [first, second, ...rest] = segments;
  const destination = first === 'index' ? 'home' : first;
  if (!isDestination(destination) || rest.length > 0) return null;

  if (second === undefined) return { destination, entityId: null };
  let decoded: string;
  try {
    decoded = decodeURIComponent(second);
  } catch {
    return null;
  }
  if (!DESTINATIONS_WITH_ENTITY.includes(destination) || !isValidEntityId(decoded)) return null;
  return { destination, entityId: decoded };
}

/**
 * Safely parses the untrusted `data` object of a received notification.
 * Unknown / malformed fields are dropped instead of throwing.
 */
export function parseNotificationData(data: unknown): ParsedNotificationData {
  const source = isPlainObject(data) ? data : {};

  let destination: Destination | null = isDestination(source.destination) ? source.destination : null;
  let entityId: string | null = null;
  const rawEntity = asNonEmptyString(source.entityId ?? source.id, LIMITS.entityIdMax);
  if (destination && rawEntity && isValidEntityId(rawEntity) && DESTINATIONS_WITH_ENTITY.includes(destination)) {
    entityId = rawEntity;
  }

  // Fallback: a `url` field (e.g. "beacon://activity/123") when no destination is given.
  if (!destination) {
    const fromUrl = parseDeepLinkUrl(source.url);
    if (fromUrl) {
      destination = fromUrl.destination;
      entityId = fromUrl.entityId;
    }
  }

  const imageUrl = asNonEmptyString(source.imageUrl, 2048);
  const custom = isPlainObject(source.custom) ? (source.custom as JsonObject) : {};

  return {
    notificationId: asNonEmptyString(source.notificationId, 64),
    destination,
    entityId,
    imageUrl: imageUrl && isHttpsUrl(imageUrl) ? imageUrl : null,
    custom,
  };
}

/** Builds the Expo Router path for a destination (group segments are omitted). */
export function buildDeepLinkPath(destination: Destination, entityId?: string | null): string {
  const id = entityId && isValidEntityId(entityId) && DESTINATIONS_WITH_ENTITY.includes(destination) ? entityId : null;
  switch (destination) {
    case 'home':
      return '/';
    case 'activity':
      return id ? `/activity/${encodeURIComponent(id)}` : '/activity';
    case 'notifications':
      return id ? `/notifications/${encodeURIComponent(id)}` : '/notifications';
    case 'settings':
      return '/settings';
    case 'camera':
      return '/camera';
  }
}

/** Resolves notification data to a router path, or `null` if it has no valid target. */
export function resolveNotificationPath(data: unknown): string | null {
  const parsed = parseNotificationData(data);
  return parsed.destination ? buildDeepLinkPath(parsed.destination, parsed.entityId) : null;
}

/** Builds the `data` payload sent with a push notification. */
export function buildNotificationPayload(input: {
  notificationId: string;
  destination: Destination;
  entityId?: string | null;
  imageUrl?: string | null;
  custom?: JsonObject | null;
}): NotificationPayloadData {
  const payload: NotificationPayloadData = {
    notificationId: input.notificationId,
    destination: input.destination,
  };
  if (input.entityId) payload.entityId = input.entityId;
  if (input.imageUrl) payload.imageUrl = input.imageUrl;
  if (input.custom && Object.keys(input.custom).length > 0) payload.custom = input.custom;
  return payload;
}
