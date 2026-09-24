import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, type EntityManager } from 'typeorm';

import { DEFAULT_CATEGORY_CATALOG } from '../../categories/application/default-category-catalog';
import { CategoryEntity } from '../../database/entities/category.entity';
import { InvitationClaimEntity } from '../../database/entities/invitation-claim.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import type {
  AccessibleSpaceRecord,
  SpaceMemberRecord,
} from '../../spaces/application/space-store';
import {
  InvitationClaimNotFoundError,
  InvitationIneligibleError,
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
      acceptInTransaction(entityManager, input),
    );
  }
}

async function acceptInTransaction(
  entityManager: EntityManager,
  input: AcceptInvitationInput,
): Promise<AccessibleSpaceRecord> {
  const initialClaim = await entityManager
    .getRepository(InvitationClaimEntity)
    .findOne({ where: { id: input.claimId, userId: input.recipientUserId } });
  if (!initialClaim) throw new InvitationClaimNotFoundError();

  const initialInvitation = await entityManager
    .getRepository(InvitationEntity)
    .findOne({ where: { id: initialClaim.invitationId } });
  if (!initialInvitation) throw new InvitationClaimNotFoundError();

  const userIds = [initialInvitation.senderUserId, input.recipientUserId].sort(
    compareBigintStrings,
  );
  if (userIds[0] === userIds[1]) {
    throw new InvitationClaimNotFoundError();
  }

  const lockedUsers = await lockUsers(entityManager, userIds);
  if (lockedUsers.length !== userIds.length) {
    throw new InvitationClaimNotFoundError();
  }

  const claim = await lockClaim(entityManager, input);
  if (!claim) throw new InvitationClaimNotFoundError();

  const lockedInvitations = await lockRelevantInvitations(
    entityManager,
    claim.invitationId,
    userIds,
  );
  const invitation = lockedInvitations.find(
    (item) => item.id === claim.invitationId,
  );
  if (!invitation) throw new InvitationClaimNotFoundError();

  if (invitation.status === 'accepted') {
    return loadAcceptedSpace(
      entityManager,
      invitation.acceptedSpaceId,
      input.recipientUserId,
    );
  }
  if (invitation.status !== 'pending') {
    throw new InvitationClaimNotFoundError();
  }
  if (invitation.expiresAt.getTime() <= input.now.getTime()) {
    invitation.status = 'expired';
    await entityManager.getRepository(InvitationEntity).save(invitation);
    throw new InvitationClaimNotFoundError();
  }

  const activeSharedMembershipCount = await entityManager
    .getRepository(SpaceMembershipEntity)
    .createQueryBuilder('membership')
    .innerJoin(SpaceEntity, 'space', 'space.id = membership.space_id')
    .where('membership.user_id IN (:...userIds)', { userIds })
    .andWhere('space.kind = :kind', { kind: 'shared' })
    .andWhere('space.status = :status', { status: 'active' })
    .getCount();
  if (activeSharedMembershipCount > 0) {
    throw new InvitationIneligibleError(
      'You or the inviter already belongs to an active Shared Space',
    );
  }

  const spaceRepository = entityManager.getRepository(SpaceEntity);
  const space = await spaceRepository.save(
    spaceRepository.create({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    }),
  );

  const membershipRepository = entityManager.getRepository(
    SpaceMembershipEntity,
  );
  await membershipRepository.save(
    lockedUsers.map((user) =>
      membershipRepository.create({
        spaceId: space.id,
        userId: user.id,
        accessLevel: 'write',
      }),
    ),
  );

  const categoryRepository = entityManager.getRepository(CategoryEntity);
  await categoryRepository.save(
    DEFAULT_CATEGORY_CATALOG.map((category) =>
      categoryRepository.create({
        spaceId: space.id,
        name: category.name,
        description: category.description,
        color: null,
        isActive: true,
      }),
    ),
  );

  for (const user of lockedUsers) {
    user.activeSharedSpaceId = space.id;
  }
  await entityManager.getRepository(UserEntity).save(lockedUsers);

  await revokeCompetingInvitations(entityManager, invitation.id, userIds);
  await deleteOtherClaimsForInvitation(
    entityManager,
    invitation.id,
    input.recipientUserId,
  );

  invitation.status = 'accepted';
  invitation.acceptedSpaceId = space.id;
  await entityManager.getRepository(InvitationEntity).save(invitation);

  return toAccessibleSpaceRecord(
    space,
    input.recipientUserId,
    lockedUsers.map(toSpaceMember),
  );
}

async function lockUsers(
  entityManager: EntityManager,
  userIds: readonly string[],
): Promise<UserEntity[]> {
  return entityManager
    .getRepository(UserEntity)
    .createQueryBuilder('user')
    .where('user.id IN (:...userIds)', { userIds })
    .andWhere('user.deleted_at IS NULL')
    .orderBy('user.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
}

async function lockClaim(
  entityManager: EntityManager,
  input: AcceptInvitationInput,
): Promise<InvitationClaimEntity | null> {
  return entityManager
    .getRepository(InvitationClaimEntity)
    .createQueryBuilder('claim')
    .where('claim.id = :claimId', { claimId: input.claimId })
    .andWhere('claim.user_id = :userId', { userId: input.recipientUserId })
    .setLock('pessimistic_write')
    .getOne();
}

async function lockRelevantInvitations(
  entityManager: EntityManager,
  acceptedInvitationId: string,
  userIds: readonly string[],
): Promise<InvitationEntity[]> {
  return entityManager
    .getRepository(InvitationEntity)
    .createQueryBuilder('invitation')
    .where('invitation.id = :acceptedInvitationId', {
      acceptedInvitationId,
    })
    .orWhere(
      '(invitation.status = :status AND invitation.id <> :acceptedInvitationId AND (invitation.sender_user_id IN (:...userIds) OR invitation.id IN (SELECT invitation_id FROM invitation_claims WHERE user_id IN (:...userIds))))',
      {
        acceptedInvitationId,
        status: 'pending',
        userIds,
      },
    )
    .orderBy('invitation.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
}

async function revokeCompetingInvitations(
  entityManager: EntityManager,
  acceptedInvitationId: string,
  userIds: readonly string[],
): Promise<void> {
  const result = await entityManager
    .getRepository(InvitationEntity)
    .createQueryBuilder()
    .update(InvitationEntity)
    .set({ status: 'revoked' })
    .where('status = :status', { status: 'pending' })
    .andWhere('id <> :acceptedInvitationId', { acceptedInvitationId })
    .andWhere(
      '(sender_user_id IN (:...userIds) OR id IN (SELECT invitation_id FROM invitation_claims WHERE user_id IN (:...userIds)))',
      { userIds },
    )
    .returning(['id'])
    .execute();

  const revokedInvitationIds = (result.raw as readonly unknown[]).flatMap(
    (row): string[] => {
      if (typeof row !== 'object' || row === null) return [];

      const id = (row as { id?: unknown }).id;
      return typeof id === 'string' ? [id] : [];
    },
  );
  if (revokedInvitationIds.length === 0) return;

  await entityManager
    .getRepository(InvitationClaimEntity)
    .createQueryBuilder()
    .delete()
    .from(InvitationClaimEntity)
    .where('invitation_id IN (:...revokedInvitationIds)', {
      revokedInvitationIds,
    })
    .execute();
}

async function deleteOtherClaimsForInvitation(
  entityManager: EntityManager,
  invitationId: string,
  recipientUserId: string,
): Promise<void> {
  await entityManager
    .getRepository(InvitationClaimEntity)
    .createQueryBuilder()
    .delete()
    .from(InvitationClaimEntity)
    .where('invitation_id = :invitationId', { invitationId })
    .andWhere('user_id <> :recipientUserId', { recipientUserId })
    .execute();
}

async function loadAcceptedSpace(
  entityManager: EntityManager,
  spaceId: string | null,
  userId: string,
): Promise<AccessibleSpaceRecord> {
  if (!spaceId) throw new InvitationClaimNotFoundError();

  const space = await entityManager
    .getRepository(SpaceEntity)
    .findOne({ where: { id: spaceId } });
  if (!space) throw new InvitationClaimNotFoundError();

  const memberships = await entityManager
    .getRepository(SpaceMembershipEntity)
    .find({ where: { spaceId }, order: { userId: 'ASC' } });
  const membership = memberships.find((item) => item.userId === userId);
  if (!membership) throw new InvitationClaimNotFoundError();

  const users = await entityManager.getRepository(UserEntity).findBy({
    id: In(memberships.map((item) => item.userId)),
  });
  return toAccessibleSpaceRecord(
    space,
    userId,
    users
      .sort((first, second) => compareBigintStrings(first.id, second.id))
      .map(toSpaceMember),
    membership.accessLevel,
  );
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
