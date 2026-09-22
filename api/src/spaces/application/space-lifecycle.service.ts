import { Inject, Injectable } from '@nestjs/common';

import {
  SPACE_LIFECYCLE_STORE,
  type ArchivedSpaceRecord,
  type IdentityDeletionResult,
  type SpaceLifecycleStore,
} from './space-lifecycle-store';
import { SpaceNotFoundError } from './space-errors';
import { SpaceNotificationsService } from './space-notifications.service';

export const SPACE_LIFECYCLE = Symbol('SPACE_LIFECYCLE');

@Injectable()
export class SpaceLifecycleService {
  constructor(
    @Inject(SPACE_LIFECYCLE_STORE)
    private readonly lifecycleStore: SpaceLifecycleStore,
    private readonly spaceNotifications: SpaceNotificationsService,
  ) {}

  async leaveSharedSpace(userId: string, spaceId: string): Promise<void> {
    const archived = await this.lifecycleStore.archiveSharedSpace(
      userId,
      spaceId,
      new Date(),
    );
    await this.notifyOtherMember(archived);
  }

  async deleteIdentity(userId: string): Promise<IdentityDeletionResult> {
    const result = await this.lifecycleStore.deleteIdentity(userId, new Date());
    for (const archived of result.archivedSpaces) {
      await this.notifyOtherMember(archived, 'Deleted user');
    }
    return result;
  }

  private async notifyOtherMember(
    archived: ArchivedSpaceRecord,
    actorName?: string,
  ): Promise<void> {
    const actor = archived.members.find(
      (member) => member.id === archived.actorUserId,
    );
    const recipient = archived.members.find(
      (member) => member.id !== archived.actorUserId,
    );
    if (!actor || !recipient) throw new SpaceNotFoundError();

    await this.spaceNotifications.notifySharedSpaceArchived({
      spaceId: archived.spaceId,
      actorUserId: archived.actorUserId,
      actorName: actorName ?? actor.name,
      recipient,
    });
  }
}
