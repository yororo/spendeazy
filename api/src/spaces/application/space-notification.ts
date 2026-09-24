import type { SpaceNotificationType } from '../../database/entities/space-notification.entity';

export type { SpaceNotificationType };

export interface SpaceNotificationRecord {
  id: string;
  recipientUserId: string;
  spaceId: string;
  actorUserId: string | null;
  type: SpaceNotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NewSpaceNotification {
  recipientUserId: string;
  spaceId: string;
  actorUserId: string | null;
  type: SpaceNotificationType;
  title: string;
  message: string;
}

export interface SpaceNotificationStore {
  listForUser(userId: string): Promise<SpaceNotificationRecord[]>;
  create(input: NewSpaceNotification): Promise<SpaceNotificationRecord>;
  markRead(
    userId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<SpaceNotificationRecord | null>;
}

export const SPACE_NOTIFICATION_STORE = Symbol('SPACE_NOTIFICATION_STORE');
