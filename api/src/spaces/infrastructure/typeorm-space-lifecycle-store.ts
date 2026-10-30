import { transactionManager } from '../../database/transaction-context';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { type EntityManager } from 'typeorm';

import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../application/space-errors';
import type {
  ArchivedSpaceRecord,
  SpaceLifecycleStore,
} from '../application/space-lifecycle-store';
import type { SpaceMemberRecord } from '../application/space-store';

@Injectable()
export class TypeOrmSpaceLifecycleStore implements SpaceLifecycleStore {
  get entityManager(): EntityManager {
    return transactionManager(this.baseEntityManager);
  }
  constructor(
    @InjectEntityManager()
    private readonly baseEntityManager: EntityManager,
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
