import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../../errors/application-error';
import { SPACE_NOTIFICATION_NOT_FOUND_CODE } from '../../errors/application-error-codes';
import {
  SPACE_NOTIFICATION_STORE,
  type NewSpaceNotification,
  type SpaceNotificationRecord,
  type SpaceNotificationStore,
} from './space-notification';
import type { SpaceMemberRecord } from './space-store';

interface SharedSpaceArchivedInput {
  spaceId: string;
  actorUserId: string;
  actorName: string;
  recipient: Pick<SpaceMemberRecord, 'id'>;
}

@Injectable()
export class SpaceNotificationsService {
  constructor(
    @Inject(SPACE_NOTIFICATION_STORE)
    private readonly notificationStore: SpaceNotificationStore,
  ) {}

  listForUser(userId: string): Promise<SpaceNotificationRecord[]> {
    return this.notificationStore.listForUser(userId);
  }

  async notifySharedSpaceArchived(
    input: SharedSpaceArchivedInput,
  ): Promise<SpaceNotificationRecord> {
    const notification = await this.notificationStore.create(
      createArchivedNotification(input),
    );
    return notification;
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
}

export class SpaceNotificationNotFoundError extends ApplicationError {
  constructor() {
    super(SPACE_NOTIFICATION_NOT_FOUND_CODE, 'Notification was not found');
  }
}

function createArchivedNotification(
  input: SharedSpaceArchivedInput,
): NewSpaceNotification {
  return {
    recipientUserId: input.recipient.id,
    spaceId: input.spaceId,
    actorUserId: input.actorUserId,
    type: 'shared_space_archived',
    title: 'Shared Space archived',
    message: `${input.actorName} ended sharing. This Shared Space is now permanent read-only history for both former members.`,
  };
}
