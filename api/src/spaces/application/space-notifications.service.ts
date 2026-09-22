import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../../errors/application-error';
import { SPACE_NOTIFICATION_NOT_FOUND_CODE } from '../../errors/application-error-codes';
import {
  SPACE_NOTIFICATION_DELIVERY,
  type SpaceNotificationDelivery,
} from './space-notification-delivery';
import {
  SPACE_NOTIFICATION_STORE,
  type NewSpaceNotification,
  type SpaceNotificationRecord,
  type SpaceNotificationStore,
} from './space-notification';
import type { SpaceArchiveMemberRecord } from './space-lifecycle-store';

@Injectable()
export class SpaceNotificationsService {
  constructor(
    @Inject(SPACE_NOTIFICATION_STORE)
    private readonly notificationStore: SpaceNotificationStore,
    @Inject(SPACE_NOTIFICATION_DELIVERY)
    private readonly notificationDelivery: SpaceNotificationDelivery,
  ) {}

  listForUser(userId: string): Promise<SpaceNotificationRecord[]> {
    return this.notificationStore.listForUser(userId);
  }

  async notifySharedSpaceArchived(input: {
    spaceId: string;
    actorUserId: string;
    actorName: string;
    recipient: SpaceArchiveMemberRecord;
  }): Promise<SpaceNotificationRecord> {
    const notification = await this.notificationStore.create(
      createArchivedNotification(input),
    );
    return this.deliver(notification, input.recipient, input.actorName);
  }

  async retryForUser(
    userId: string,
    notificationId: string,
  ): Promise<SpaceNotificationRecord> {
    const notification = await this.notificationStore.findForUser(
      userId,
      notificationId,
    );
    if (!notification)
      return Promise.reject(new SpaceNotificationNotFoundError());

    const context = await this.notificationStore.findDeliveryContext(
      notification.id,
    );
    if (!context) throw new SpaceNotificationNotFoundError();
    return this.deliver(notification, context.recipient, context.actorName);
  }

  async markRead(
    userId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<SpaceNotificationRecord> {
    const notification = await this.notificationStore.markRead(
      userId,
      notificationId,
      readAt,
    );
    if (!notification) throw new SpaceNotificationNotFoundError();
    return notification;
  }

  private async deliver(
    notification: SpaceNotificationRecord,
    recipient: SpaceArchiveMemberRecord,
    actorName: string,
  ): Promise<SpaceNotificationRecord> {
    let deliveryError: string | null = null;
    try {
      await this.notificationDelivery.send({
        notificationId: notification.id,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        actorName,
        spaceId: notification.spaceId,
        message: notification.message,
      });
    } catch (error: unknown) {
      deliveryError = (
        error instanceof Error ? error.message : 'Delivery failed'
      ).slice(0, 500);
    }

    const updated = await this.notificationStore.updateDelivery(
      notification.id,
      deliveryError === null ? 'sent' : 'failed',
      deliveryError,
    );
    return updated ?? notification;
  }
}

export class SpaceNotificationNotFoundError extends ApplicationError {
  constructor() {
    super(SPACE_NOTIFICATION_NOT_FOUND_CODE, 'Notification was not found');
  }
}

function createArchivedNotification(input: {
  spaceId: string;
  actorUserId: string;
  actorName: string;
  recipient: SpaceArchiveMemberRecord;
}): NewSpaceNotification {
  return {
    recipientUserId: input.recipient.id,
    spaceId: input.spaceId,
    actorUserId: input.actorUserId,
    type: 'shared_space_archived',
    title: 'Shared Space archived',
    message: `${input.actorName} ended sharing. This Shared Space is now permanent read-only history for both former members.`,
  };
}
