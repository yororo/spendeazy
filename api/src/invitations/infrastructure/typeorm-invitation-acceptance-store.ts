import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, type EntityManager } from 'typeorm';

import { DEFAULT_CATEGORY_CATALOG } from '../../categories/application/default-category-catalog';
import { CategoryEntity } from '../../database/entities/category.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import type {
  AccessibleSpaceRecord,
  SpaceMemberRecord,
} from '../../spaces/application/space-store';
import {
  InvitationCanceledError,
  InvitationDeclinedError,
  InvitationExpiredError,
  InvitationIneligibleError,
  InvitationNotFoundError,
  InvitationSelfError,
} from '../application/invitation-errors';
import type {
  AcceptInvitationInput,
  InvitationAcceptanceStore,
} from '../application/invitation-acceptance-store';

@Injectable()
export class TypeOrmInvitationAcceptanceStore implements InvitationAcceptanceStore {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  accept(input: AcceptInvitationInput): Promise<AccessibleSpaceRecord> {
    return this.entityManager.transaction((entityManager) =>
      this.acceptInTransaction(entityManager, input),
    );
  }

  private async acceptInTransaction(
    entityManager: EntityManager,
    input: AcceptInvitationInput,
  ): Promise<AccessibleSpaceRecord> {
    const invitationRepository = entityManager.getRepository(InvitationEntity);
    const initialInvitation = await invitationRepository.findOne({
      where: { id: input.invitationId },
    });
    if (!initialInvitation) throw new InvitationNotFoundError();
    if (
      !input.verifiedRecipientEmails.includes(initialInvitation.recipientEmail)
    ) {
      throw new InvitationNotFoundError();
    }
    if (
      initialInvitation.recipientUserId !== null &&
      initialInvitation.recipientUserId !== input.recipientUserId
    ) {
      throw new InvitationNotFoundError();
    }

    if (initialInvitation.status === 'accepted') {
      if (initialInvitation.recipientUserId !== input.recipientUserId) {
        throw new InvitationNotFoundError();
      }
      return this.requireAcceptedSpace(
        entityManager,
        initialInvitation.acceptedSpaceId,
        input.recipientUserId,
      );
    }
    assertPendingInvitation(
      initialInvitation.status,
      input.now,
      initialInvitation.expiresAt,
    );

    if (initialInvitation.senderUserId === input.recipientUserId) {
      throw new InvitationSelfError();
    }

    const userIds = [
      initialInvitation.senderUserId,
      input.recipientUserId,
    ].sort(compareBigintStrings);
    const lockedUsers = await entityManager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('user.id IN (:...userIds)', { userIds })
      .orderBy('user.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    if (lockedUsers.length !== userIds.length) {
      throw new InvitationNotFoundError();
    }

    const invitation = await invitationRepository
      .createQueryBuilder('invitation')
      .where('invitation.id = :invitationId', {
        invitationId: input.invitationId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!invitation) throw new InvitationNotFoundError();
    if (invitation.status === 'accepted') {
      if (invitation.recipientUserId !== input.recipientUserId) {
        throw new InvitationNotFoundError();
      }
      return this.requireAcceptedSpace(
        entityManager,
        invitation.acceptedSpaceId,
        input.recipientUserId,
      );
    }
    assertPendingInvitation(invitation.status, input.now, invitation.expiresAt);
    if (
      invitation.recipientUserId !== null &&
      invitation.recipientUserId !== input.recipientUserId
    ) {
      throw new InvitationNotFoundError();
    }

    const activeSharedMemberships = await this.findActiveSharedMemberships(
      entityManager,
      userIds,
    );
    if (activeSharedMemberships.length > 0) {
      throw new InvitationIneligibleError(
        'Both Users must be free of an active Shared Space before accepting this invitation',
      );
    }

    const space = await entityManager.getRepository(SpaceEntity).save(
      entityManager.getRepository(SpaceEntity).create({
        kind: 'shared',
        status: 'active',
        personalOwnerUserId: null,
      }),
    );

    await entityManager.getRepository(SpaceMembershipEntity).save(
      lockedUsers.map((user) => ({
        spaceId: space.id,
        userId: user.id,
        accessLevel: 'write' as const,
      })),
    );

    await entityManager.getRepository(CategoryEntity).save(
      DEFAULT_CATEGORY_CATALOG.map((category) => ({
        spaceId: space.id,
        name: category.name,
        description: category.description,
        color: null,
        isActive: true,
      })),
    );

    for (const user of lockedUsers) {
      user.activeSharedSpaceId = space.id;
    }
    await entityManager.getRepository(UserEntity).save(lockedUsers);

    await invitationRepository
      .createQueryBuilder()
      .update(InvitationEntity)
      .set({ status: 'canceled' })
      .where('status = :status', { status: 'pending' })
      .andWhere('id <> :invitationId', { invitationId: invitation.id })
      .andWhere(
        '(sender_user_id IN (:...userIds) OR recipient_user_id IN (:...userIds) OR recipient_email IN (:...invalidationEmails))',
        {
          userIds,
          invalidationEmails: [
            ...new Set([
              ...input.verifiedRecipientEmails,
              ...lockedUsers.map((user) => user.email),
            ]),
          ],
        },
      )
      .execute();

    invitation.recipientUserId = input.recipientUserId;
    invitation.acceptedSpaceId = space.id;
    invitation.status = 'accepted';
    await invitationRepository.save(invitation);

    return toAccessibleSpaceRecord(
      space,
      input.recipientUserId,
      lockedUsers.map(toSpaceMember),
    );
  }

  private async requireAcceptedSpace(
    entityManager: EntityManager,
    spaceId: string | null,
    userId: string,
  ): Promise<AccessibleSpaceRecord> {
    if (!spaceId) throw new InvitationNotFoundError();

    const space = await entityManager
      .getRepository(SpaceEntity)
      .findOne({ where: { id: spaceId } });
    if (!space) throw new InvitationNotFoundError();

    const memberships = await entityManager
      .getRepository(SpaceMembershipEntity)
      .find({ where: { spaceId }, order: { userId: 'ASC' } });
    const members = await entityManager.getRepository(UserEntity).findBy({
      id: In(memberships.map((membership) => membership.userId)),
    });
    if (!members.some((member) => member.id === userId)) {
      throw new InvitationNotFoundError();
    }

    return toAccessibleSpaceRecord(
      space,
      userId,
      members
        .sort((first, second) => compareBigintStrings(first.id, second.id))
        .map(toSpaceMember),
      memberships.find((membership) => membership.userId === userId)
        ?.accessLevel ?? 'read',
    );
  }

  private async findActiveSharedMemberships(
    entityManager: EntityManager,
    userIds: readonly string[],
  ): Promise<SpaceMembershipEntity[]> {
    const memberships = await entityManager
      .getRepository(SpaceMembershipEntity)
      .find({ where: { userId: In([...userIds]) } });
    if (memberships.length === 0) return [];

    const spaces = await entityManager.getRepository(SpaceEntity).findBy({
      id: In([...new Set(memberships.map((membership) => membership.spaceId))]),
    });
    const spacesById = new Map(spaces.map((space) => [space.id, space]));
    return memberships.filter((membership) => {
      const space = spacesById.get(membership.spaceId);
      return space?.kind === 'shared' && space.status === 'active';
    });
  }
}

function assertPendingInvitation(
  status: InvitationEntity['status'],
  now: Date,
  expiresAt: Date,
): void {
  if (status === 'canceled') throw new InvitationCanceledError();
  if (status === 'declined') throw new InvitationDeclinedError();
  if (status === 'expired' || expiresAt <= now) {
    throw new InvitationExpiredError();
  }
  if (status !== 'pending') throw new InvitationNotFoundError();
}

function toAccessibleSpaceRecord(
  space: SpaceEntity,
  userId: string,
  members: readonly SpaceMemberRecord[],
  accessLevel: 'read' | 'write' = 'write',
): AccessibleSpaceRecord {
  return {
    id: space.id,
    kind: space.kind,
    status: space.status,
    personalOwnerUserId: space.personalOwnerUserId,
    userId,
    accessLevel,
    members,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

function toSpaceMember(user: UserEntity): SpaceMemberRecord {
  return { id: user.id, name: user.name };
}

function compareBigintStrings(first: string, second: string): number {
  if (first.length !== second.length) return first.length - second.length;
  return first.localeCompare(second);
}
