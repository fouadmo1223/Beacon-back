import { z } from 'zod';
import {
  AUDIENCES,
  DESTINATIONS,
  ENTITY_ID_REGEX,
  EXPO_PUSH_TOKEN_REGEX,
  LANGUAGES,
  LIMITS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_STATUSES,
  PERMISSION_STATES,
  PLATFORM_FILTERS,
  PLATFORMS,
} from '../constants';

/* ---------------------------------------------------------------- primitives */

export const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(EXPO_PUSH_TOKEN_REGEX, { error: 'Must be a valid Expo push token, e.g. ExponentPushToken[xxxx]' });

export const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.entityIdMax)
  .regex(ENTITY_ID_REGEX, { error: 'Only letters, numbers, "-" and "_" are allowed' });

export const httpsUrlSchema = z.url({ protocol: /^https$/, error: 'Must be a valid https:// URL' }).max(2048);

/** A JSON object (not array / primitive) with a bounded serialized size. */
export const customDataSchema = z
  .record(z.string().min(1).max(64), z.json())
  .refine((value) => JSON.stringify(value).length <= LIMITS.customDataMaxBytes, {
    error: `Custom data must be smaller than ${LIMITS.customDataMaxBytes} bytes`,
  });

/* ------------------------------------------------------------------- devices */

export const registerDeviceSchema = z.object({
  installationId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
  platform: z.enum(PLATFORMS),
  pushToken: expoPushTokenSchema.nullable(),
  language: z.enum(LANGUAGES),
  appVersion: z.string().trim().min(1).max(32),
  osVersion: z.string().trim().max(32).nullable().optional(),
  deviceModel: z.string().trim().max(64).nullable().optional(),
  notificationPermission: z.enum(PERMISSION_STATES),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(10);

export const deviceListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(100).optional(),
  platform: z.enum(PLATFORMS).optional(),
  language: z.enum(LANGUAGES).optional(),
  permission: z.enum(PERMISSION_STATES).optional(),
});
export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;

/* ------------------------------------------------------------- notifications */

const notificationBaseSchema = z.object({
  title: z.string().trim().min(1, { error: 'Title is required' }).max(LIMITS.titleMax),
  body: z.string().trim().min(1, { error: 'Message is required' }).max(LIMITS.bodyMax),
  imageUrl: httpsUrlSchema.optional(),
  destination: z.enum(DESTINATIONS),
  entityId: entityIdSchema.optional(),
  audience: z.enum(AUDIENCES),
  platform: z.enum(PLATFORM_FILTERS).default('all'),
  deviceToken: expoPushTokenSchema.optional(),
  data: customDataSchema.optional(),
});

type NotificationBase = z.infer<typeof notificationBaseSchema>;

/** Cross-field rules shared by "send now" and "schedule" requests. */
function validateAudience(value: NotificationBase, ctx: z.RefinementCtx) {
  if (value.audience === 'device' && !value.deviceToken) {
    ctx.addIssue({ code: 'custom', path: ['deviceToken'], message: 'A device push token is required' });
  }
  const audiencePlatform = value.audience === 'ios' || value.audience === 'android' ? value.audience : null;
  if (audiencePlatform && value.platform !== 'all' && value.platform !== audiencePlatform) {
    ctx.addIssue({
      code: 'custom',
      path: ['platform'],
      message: `Platform conflicts with the ${audiencePlatform} audience`,
    });
  }
}

export const sendNotificationSchema = notificationBaseSchema.superRefine(validateAudience);
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;

export const scheduleNotificationSchema = notificationBaseSchema
  .extend({
    scheduledAt: z.iso.datetime({ offset: true, error: 'Must be an ISO 8601 date' }),
  })
  .superRefine((value, ctx) => {
    validateAudience(value, ctx);
    if (new Date(value.scheduledAt).getTime() <= Date.now() + 30_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledAt'],
        message: 'Scheduled time must be at least 1 minute in the future',
      });
    }
  });
export type ScheduleNotificationInput = z.infer<typeof scheduleNotificationSchema>;

export const notificationListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(100).optional(),
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  platform: z.enum(PLATFORM_FILTERS).optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationEventSchema = z.object({
  type: z.enum(NOTIFICATION_EVENT_TYPES),
  installationId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/),
});
export type NotificationEventInput = z.infer<typeof notificationEventSchema>;

/* ------------------------------------------------------------------- helpers */

/** Flattens zod issues into `{ "field.path": ["message"] }` for API/UI errors. */
export function flattenZodIssues(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_root';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
