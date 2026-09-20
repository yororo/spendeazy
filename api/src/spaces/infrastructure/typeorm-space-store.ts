import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, QueryFailedError, type EntityManager } from 'typeorm';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import type {
  AccessibleSpaceRecord,
  PersonalSpaceProvisioner,
  SpaceRecord,
  SpaceStore,
} from '../application/space-store';

@Injectable()
export class TypeOrmSpaceStore implements SpaceStore, PersonalSpaceProvisioner {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async listAccessible(userId: string): Promise<AccessibleSpaceRecord[]> {
    const memberships = await this.entityManager
      .getRepository(SpaceMembershipEntity)
      .find({ where: { userId }, order: { spaceId: 'ASC' } });
    if (memberships.length === 0) {
      return [];
    }

    const spaces = await this.entityManager
      .getRepository(SpaceEntity)
      .findBy({ id: In(memberships.map((membership) => membership.spaceId)) });
    const spacesById = new Map(spaces.map((space) => [space.id, space]));

    return memberships
      .flatMap((membership) => {
        const space = spacesById.get(membership.spaceId);
        return space
          ? [toAccessibleSpaceRecord(space, membership.accessLevel, userId)]
          : [];
      })
      .sort(compareAccessibleSpaces);
  }

  async findAccessible(
    userId: string,
    spaceId: string,
  ): Promise<AccessibleSpaceRecord | null> {
    const membership = await this.entityManager
      .getRepository(SpaceMembershipEntity)
      .findOne({ where: { userId, spaceId } });
    if (!membership) {
      return null;
    }

    const space = await this.entityManager
      .getRepository(SpaceEntity)
      .findOne({ where: { id: spaceId } });
    return space
      ? toAccessibleSpaceRecord(space, membership.accessLevel, userId)
      : null;
  }

  async ensurePersonalSpace(userId: string): Promise<void> {
    const spaceRepository = this.entityManager.getRepository(SpaceEntity);
    const membershipRepository = this.entityManager.getRepository(
      SpaceMembershipEntity,
    );
    let space = await spaceRepository.findOne({
      where: { kind: 'personal', personalOwnerUserId: userId },
    });

    if (!space) {
      try {
        space = await spaceRepository.save(
          spaceRepository.create({
            kind: 'personal',
            status: 'active',
            personalOwnerUserId: userId,
          }),
        );
      } catch (error: unknown) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        space = await spaceRepository.findOne({
          where: { kind: 'personal', personalOwnerUserId: userId },
        });
        if (!space) {
          throw error;
        }
      }
    }

    const membership = await membershipRepository.findOne({
      where: { spaceId: space.id, userId },
    });
    if (!membership) {
      try {
        await membershipRepository.save(
          membershipRepository.create({
            spaceId: space.id,
            userId,
            accessLevel: 'write',
          }),
        );
      } catch (error: unknown) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const racedMembership = await membershipRepository.findOne({
          where: { spaceId: space.id, userId },
        });
        if (!racedMembership) {
          throw error;
        }

        if (racedMembership.accessLevel !== 'write') {
          racedMembership.accessLevel = 'write';
          await membershipRepository.save(racedMembership);
        }
      }
      return;
    }

    if (membership.accessLevel !== 'write') {
      membership.accessLevel = 'write';
      await membershipRepository.save(membership);
    }
  }
}

function toSpaceRecord(entity: SpaceEntity): SpaceRecord {
  return {
    id: entity.id,
    kind: entity.kind,
    status: entity.status,
    personalOwnerUserId: entity.personalOwnerUserId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toAccessibleSpaceRecord(
  entity: SpaceEntity,
  accessLevel: AccessibleSpaceRecord['accessLevel'],
  userId: string,
): AccessibleSpaceRecord {
  return { ...toSpaceRecord(entity), userId, accessLevel };
}

function compareAccessibleSpaces(
  first: AccessibleSpaceRecord,
  second: AccessibleSpaceRecord,
): number {
  if (first.kind !== second.kind) {
    return first.kind === 'personal' ? -1 : 1;
  }

  return compareBigintStrings(first.id, second.id);
}

function compareBigintStrings(first: string, second: string): number {
  if (first.length !== second.length) {
    return first.length - second.length;
  }

  return first.localeCompare(second);
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}
