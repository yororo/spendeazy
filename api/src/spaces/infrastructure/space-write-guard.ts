import type { EntityManager } from 'typeorm';

import { SpaceEntity } from '../../database/entities/space.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../application/space-errors';
import { UserNotFoundError } from '../../users/application/user-errors';
import { AccountDeletionError } from '../../users/application/user-errors';

/**
 * Lock the actor before checking the destination Space. Financial-table
 * triggers take the Space row lock and recheck its status in the same
 * transaction as the mutation. Taking a Space lock here would make those
 * triggers upgrade competing locks and can deadlock concurrent writes.
 * Controllers check the authenticated member before entering the store.
 */
export async function prepareWritableSpace(
  entityManager: EntityManager,
  spaceId: string,
  actorUserId?: string,
): Promise<SpaceEntity> {
  // Archiving locks member User rows before the Space row. Writes that create
  // actor-attributed records use the same order so archive and write cannot
  // deadlock while PostgreSQL checks the actor foreign key.
  if (actorUserId !== undefined) {
    const actor = await entityManager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('user.id = :actorUserId', { actorUserId })
      .setLock('pessimistic_read')
      .getOne();

    if (!actor) throw new UserNotFoundError();
    if (actor.deletionStatus !== 'active')
      throw new AccountDeletionError(actor.deletionStatus);
  }

  return findWritableSpace(entityManager, spaceId);
}

/** Serialize operations whose optimistic revision belongs to the whole Space. */
export async function lockWritableSpace(
  entityManager: EntityManager,
  spaceId: string,
): Promise<SpaceEntity> {
  return findWritableSpace(entityManager, spaceId, true);
}

async function findWritableSpace(
  entityManager: EntityManager,
  spaceId: string,
  exclusive = false,
): Promise<SpaceEntity> {
  const query = entityManager
    .getRepository(SpaceEntity)
    .createQueryBuilder('space')
    .where('space.id = :spaceId', { spaceId });
  if (exclusive) query.setLock('pessimistic_write');
  const space = await query.getOne();

  if (!space) throw new SpaceNotFoundError();

  if (space.status !== 'active') throw new SpaceNotWritableError();
  return space;
}
