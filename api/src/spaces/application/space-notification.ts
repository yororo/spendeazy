import type {
  SpaceNotificationDeliveryStatus,
  SpaceNotificationType,
} from '../../database/entities/space-notification.entity';
import type { SpaceArchiveMemberRecord } from './space-lifecycle-store';

export type { SpaceNotificationDeliveryStatus, SpaceNotificationType };

export interface SpaceNotificationRecord {
  id: string;
  recipientUserId: string;
  spaceId: string;
  actorUserId: string | null;
  type: SpaceNotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  emailDeliveryStatus: SpaceNotificationDeliveryStatus;
  emailDeliveryError: string | null;
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
  findForUser(
    userId: string,
    notificationId: string,
  ): Promise<SpaceNotificationRecord | null>;
  findDeliveryContext(
    notificationId: string,
  ): Promise<{ recipient: SpaceArchiveMemberRecord; actorName: string } | null>;
  create(input: NewSpaceNotification): Promise<SpaceNotificationRecord>;
  updateDelivery(
    notificationId: string,
    status: SpaceNotificationDeliveryStatus,
    error: string | null,
  ): Promise<SpaceNotificationRecord | null>;
  markRead(
    userId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<SpaceNotificationRecord | null>;
}

export const SPACE_NOTIFICATION_STORE = Symbol('SPACE_NOTIFICATION_STORE');
