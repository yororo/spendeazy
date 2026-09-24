import {
  ApiError,
  isRecord,
  isUtcDateTime,
  type ApiClient,
} from '@/shared/api';

type SpaceNotificationType = 'shared_space_archived';

interface SpaceNotification {
  readonly id: string;
  readonly spaceId: string;
  readonly type: SpaceNotificationType;
  readonly title: string;
  readonly message: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}

type NotificationClient = Pick<ApiClient, 'get' | 'post'>;

function isSpaceNotification(value: unknown): value is SpaceNotification {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    /^[1-9]\d*$/u.test(value.id) &&
    typeof value.spaceId === 'string' &&
    /^[1-9]\d*$/u.test(value.spaceId) &&
    value.type === 'shared_space_archived' &&
    typeof value.title === 'string' &&
    typeof value.message === 'string' &&
    (value.readAt === null || isUtcDateTime(value.readAt)) &&
    isUtcDateTime(value.createdAt)
  );
}

function invalidNotificationsError(): ApiError {
  return new ApiError('The API returned invalid Space notifications.', {
    kind: 'malformed-response',
  });
}

function requireSpaceNotifications(
  value: unknown,
): readonly SpaceNotification[] {
  if (!Array.isArray(value) || !value.every(isSpaceNotification)) {
    throw invalidNotificationsError();
  }
  return value;
}

async function getSpaceNotifications(
  apiClient: Pick<NotificationClient, 'get'>,
  signal?: AbortSignal,
): Promise<readonly SpaceNotification[]> {
  return requireSpaceNotifications(
    await apiClient.get<unknown>('/notifications', { signal }),
  );
}

async function markSpaceNotificationRead(
  apiClient: Pick<NotificationClient, 'post'>,
  notificationId: string,
): Promise<SpaceNotification> {
  const response = await apiClient.post<unknown>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    {},
    { expectedStatuses: [200] },
  );
  if (!isSpaceNotification(response)) throw invalidNotificationsError();
  return response;
}

export {
  getSpaceNotifications,
  isSpaceNotification,
  markSpaceNotificationRead,
  requireSpaceNotifications,
};
export type {
  SpaceNotification,
  SpaceNotificationType,
};
