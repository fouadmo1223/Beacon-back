import type {
  Audience,
  Destination,
  DevicePlatform,
  Language,
  NotificationStatus,
  PermissionState,
  PlatformFilter,
} from '../constants';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface DeviceRecord {
  id: string;
  installationId: string;
  platform: DevicePlatform;
  /** Masked when returned by list endpoints. */
  pushToken: string | null;
  language: Language;
  appVersion: string;
  osVersion: string | null;
  deviceModel: string | null;
  notificationPermission: PermissionState;
  createdAt: string;
  lastActiveAt: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  destination: Destination;
  entityId: string | null;
  data: JsonObject | null;
  audience: Audience;
  platform: PlatformFilter;
  /** Masked target token when audience is `device`. */
  deviceToken: string | null;
  status: NotificationStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  targetCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openedCount: number;
  errorMessage: string | null;
}

/** Payload placed in the `data` field of every push/local notification. */
export interface NotificationPayloadData {
  notificationId?: string;
  destination?: Destination;
  entityId?: string;
  imageUrl?: string;
  custom?: JsonObject;
}

export interface OverviewStats {
  registeredDevices: number;
  androidDevices: number;
  iosDevices: number;
  notificationsSent: number;
  notificationsOpened: number;
  openRate: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
