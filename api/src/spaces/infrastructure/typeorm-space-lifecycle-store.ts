import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, type EntityManager } from 'typeorm';

import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../application/space-errors';
import type {
  ArchivedSpaceRecord,
  IdentityDeletionResult,
  SpaceLifecycleStore,
} from '../application/space-lifecycle-store';
import type { SpaceMemberRecord } from '../application/space-store';

@Injectable()
export class TypeOrmSpaceLifecycleStore implements SpaceLifecycleStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  archiveSharedSpace(
    userId: string,
    spaceId: string,
    archivedAt: Date,
  ): Promise<ArchivedSpaceRecord> {
    return this.entityManager.transaction((entityManager) =>
      archiveSharedSpaceInTransaction(
        entityManager,
        userId,
        spaceId,
        archivedAt,
      ),
    );
  }

  deleteIdentity(
    userId: string,
    deletedAt: Date,
  ): Promise<IdentityDeletionResult> {
    return this.entityManager.transaction((entityManager) =>
      deleteIdentityInTransaction(entityManager, userId, deletedAt),
    );
  }
}

async function archiveSharedSpaceInTransaction(
  entityManager: EntityManager,
  userId: string,
  spaceId: string,
  archivedAt: Date,
): Promise<ArchivedSpaceRecord> {
  const membershipRepository = entityManager.getRepository(
    SpaceMembershipEntity,
  );
  const initialMembership = await membershipRepository.findOne({
    where: { spaceId, userId },
  });
  if (!initialMembership) throw new SpaceNotFoundError();

  const initialMemberships = await membershipRepository.find({
    where: { spaceId },
    order: { userId: 'ASC' },
  });
  const userIds = [...new Set(initialMemberships.map((item) => item.userId))];
  const lockedUsers = await lockUsers(entityManager, userIds);
  const space = await lockSpace(entityManager, spaceId);
  if (!space || space.kind !== 'shared') throw new SpaceNotFoundError();
  if (space.status !== 'active' || initialMembership.accessLevel !== 'write') {
    throw new SpaceNotWritableError();
  }
  if (initialMemberships.length !== 2 || lockedUsers.length !== 2) {
    throw new SpaceNotWritableError();
  }

  const currentMemberships = await membershipRepository.find({
    where: { spaceId },
    order: { userId: 'ASC' },
  });
  if (
    currentMemberships.length !== 2 ||
    !currentMemberships.some(
      (membership) =>
        membership.userId === userId && membership.accessLevel === 'write',
    )
  ) {
    throw new SpaceNotWritableError();
  }

  space.status = 'archived';
  await entityManager.getRepository(SpaceEntity).save(space);

  for (const membership of currentMemberships) {
    membership.accessLevel = 'read';
  }
  await membershipRepository.save(currentMemberships);

  for (const user of lockedUsers) {
    user.activeSharedSpaceId = null;
  }
  await entityManager.getRepository(UserEntity).save(lockedUsers);

  return {
    spaceId,
    actorUserId: userId,
    members: lockedUsers.sort(compareUsers).map(toArchiveMember),
    archivedAt,
  };
}

async function deleteIdentityInTransaction(
  entityManager: EntityManager,
  userId: string,
  deletedAt: Date,
): Promise<IdentityDeletionResult> {
  const membershipRepository = entityManager.getRepository(
    SpaceMembershipEntity,
  );
  const initialState = await loadIdentityMembershipState(entityManager, userId);
  const lockedUsers = await lockUsers(entityManager, [
    ...new Set([
      userId,
      ...initialState.allMemberships.map((membership) => membership.userId),
    ]),
  ]);
  const deletedUser = lockedUsers.find((user) => user.id === userId);
  if (!deletedUser) throw new SpaceNotFoundError();
  if (deletedUser.deletedAt !== null) {
    return { deletedUserId: userId, archivedSpaces: [] };
  }

  deletedUser.deletedAt = deletedAt;
  deletedUser.name = 'Deleted user';
  deletedUser.email = `deleted-user-${deletedUser.id}@invalid.local`;
  deletedUser.clerkUserId = `deleted-user-${deletedUser.id}`;

  const currentState = await loadIdentityMembershipState(entityManager, userId);
  const { memberships, spacesById, activeSharedSpaceIds, allMemberships } =
    currentState;
  const lockedSpaces = await lockSpaces(entityManager, activeSharedSpaceIds);
  const archivedSpaces: ArchivedSpaceRecord[] = [];
  for (const space of lockedSpaces) {
    if (space.kind !== 'shared' || space.status !== 'active') continue;
    const spaceMemberships = allMemberships.filter(
      (membership) => membership.spaceId === space.id,
    );
    if (spaceMemberships.length !== 2) continue;

    space.status = 'archived';
    await entityManager.getRepository(SpaceEntity).save(space);
    for (const membership of spaceMemberships) {
      membership.accessLevel = 'read';
    }
    await membershipRepository.save(spaceMemberships);
    archivedSpaces.push({
      spaceId: space.id,
      actorUserId: userId,
      members: lockedUsers
        .filter((user) =>
          spaceMemberships.some((membership) => membership.userId === user.id),
        )
        .sort(compareUsers)
        .map(toArchiveMember),
      archivedAt: deletedAt,
    });
  }

  const archivedSpaceIds = new Set(
    archivedSpaces.map((archivedSpace) => archivedSpace.spaceId),
  );
  for (const user of lockedUsers) {
    if (
      user.id === userId ||
      (user.activeSharedSpaceId !== null &&
        archivedSpaceIds.has(user.activeSharedSpaceId))
    ) {
      user.activeSharedSpaceId = null;
    }
  }
  await entityManager.getRepository(UserEntity).save(lockedUsers);

  for (const membership of memberships) {
    const space = spacesById.get(membership.spaceId);
    if (!space) continue;
    if (shouldRemoveIdentityMembership(space)) {
      await membershipRepository.delete({
        spaceId: membership.spaceId,
        userId,
      });
    }
  }

  return { deletedUserId: userId, archivedSpaces };
}

export function shouldRemoveIdentityMembership(
  space: Pick<SpaceEntity, 'kind'>,
): boolean {
  return space.kind === 'personal';
}

async function loadIdentityMembershipState(
  entityManager: EntityManager,
  userId: string,
): Promise<{
  memberships: SpaceMembershipEntity[];
  spacesById: Map<string, SpaceEntity>;
  activeSharedSpaceIds: string[];
  allMemberships: SpaceMembershipEntity[];
}> {
  const membershipRepository = entityManager.getRepository(
    SpaceMembershipEntity,
  );
  const memberships = await membershipRepository.find({
    where: { userId },
    order: { spaceId: 'ASC' },
  });
  const spaces = memberships.length
    ? await entityManager.getRepository(SpaceEntity).findBy({
        id: In(memberships.map((membership) => membership.spaceId)),
      })
    : [];
  const spacesById = new Map(spaces.map((space) => [space.id, space]));
  const activeSharedSpaceIds = memberships
    .filter((membership) => {
      const space = spacesById.get(membership.spaceId);
      return space?.kind === 'shared' && space.status === 'active';
    })
    .map((membership) => membership.spaceId);
  const allMemberships = activeSharedSpaceIds.length
    ? await membershipRepository.find({
        where: { spaceId: In(activeSharedSpaceIds) },
        order: { spaceId: 'ASC', userId: 'ASC' },
      })
    : [];

  return {
    memberships,
    spacesById,
    activeSharedSpaceIds,
    allMemberships,
  };
}

async function lockUsers(
  entityManager: EntityManager,
  userIds: readonly string[],
): Promise<UserEntity[]> {
  if (userIds.length === 0) return [];
  return entityManager
    .getRepository(UserEntity)
    .createQueryBuilder('user')
    .where('user.id IN (:...userIds)', {
      userIds: [...userIds].sort(compareBigintStrings),
    })
    .orderBy('user.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
}

async function lockSpace(
  entityManager: EntityManager,
  spaceId: string,
): Promise<SpaceEntity | null> {
  return entityManager
    .getRepository(SpaceEntity)
    .createQueryBuilder('space')
    .where('space.id = :spaceId', { spaceId })
    .setLock('pessimistic_write')
    .getOne();
}

async function lockSpaces(
  entityManager: EntityManager,
  spaceIds: readonly string[],
): Promise<SpaceEntity[]> {
  if (spaceIds.length === 0) return [];
  return entityManager
    .getRepository(SpaceEntity)
    .createQueryBuilder('space')
    .where('space.id IN (:...spaceIds)', {
      spaceIds: [...spaceIds].sort(compareBigintStrings),
    })
    .orderBy('space.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
}

function toArchiveMember(user: UserEntity): SpaceMemberRecord {
  return { id: user.id, name: user.name };
}

function compareUsers(first: UserEntity, second: UserEntity): number {
  return compareBigintStrings(first.id, second.id);
}

function compareBigintStrings(first: string, second: string): number {
  if (first.length !== second.length) return first.length - second.length;
  return first.localeCompare(second);
}
