import { transactionManager } from '../../database/transaction-context';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, QueryFailedError, type EntityManager } from 'typeorm';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import type {
  AccessibleSpaceRecord,
  PersonalSpaceProvisioner,
  SpaceMemberRecord,
  SpaceRecord,
  SpaceStore,
} from '../application/space-store';

@Injectable()
export class TypeOrmSpaceStore implements SpaceStore, PersonalSpaceProvisioner {
  get entityManager(): EntityManager {
    return transactionManager(this.baseEntityManager);
  }
  constructor(
    @InjectEntityManager()
    private readonly baseEntityManager: EntityManager,
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
    const membersBySpaceId = await this.listMembersBySpaceId(
      memberships.map((membership) => membership.spaceId),
    );

    const attribution = await this.listAttributionBySpaceId(spaces);
    return memberships
      .flatMap((membership) => {
        const space = spacesById.get(membership.spaceId);
        return space
          ? [
              toAccessibleSpaceRecord(
                space,
                membership.accessLevel,
                userId,
                membersBySpaceId.get(space.id) ?? [],
                attribution.get(space.id) ?? [],
              ),
            ]
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
    if (!space) return null;

    const membersBySpaceId = await this.listMembersBySpaceId([spaceId]);
    const attribution = await this.listAttributionBySpaceId([space]);
    return toAccessibleSpaceRecord(
      space,
      membership.accessLevel,
      userId,
      membersBySpaceId.get(spaceId) ?? [],
      attribution.get(spaceId) ?? [],
    );
  }

  private async listMembersBySpaceId(
    spaceIds: readonly string[],
  ): Promise<Map<string, SpaceMemberRecord[]>> {
    const membersBySpaceId = new Map<string, SpaceMemberRecord[]>();
    if (spaceIds.length === 0) return membersBySpaceId;

    const memberships = await this.entityManager
      .getRepository(SpaceMembershipEntity)
      .find({
        where: { spaceId: In([...new Set(spaceIds)]) },
        order: { spaceId: 'ASC', userId: 'ASC' },
      });
    if (memberships.length === 0) return membersBySpaceId;

    const users = await this.entityManager.getRepository(UserEntity).findBy({
      id: In([...new Set(memberships.map((membership) => membership.userId))]),
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    for (const membership of memberships) {
      const user = usersById.get(membership.userId);
      if (!user) continue;

      const members = membersBySpaceId.get(membership.spaceId) ?? [];
      members.push(
        user.deletionStatus === 'active'
          ? { id: user.id, name: user.name, photoUrl: user.photoUrl }
          : { id: user.id, name: 'Deleted user', photoUrl: null },
      );
      membersBySpaceId.set(membership.spaceId, members);
    }

    return membersBySpaceId;
  }

  private async listAttributionBySpaceId(
    spaces: readonly SpaceEntity[],
  ): Promise<Map<string, SpaceMemberRecord[]>> {
    const sharedIds = spaces
      .filter((space) => space.kind === 'shared')
      .map((space) => space.id);
    const result = new Map<string, SpaceMemberRecord[]>();
    if (!sharedIds.length) return result;
    // Only authorized Space IDs reach this query. Actor references confer no access.
    const rows = await this.entityManager.query<
      Array<{
        spaceId: string;
        id: string;
        name: string;
        photoUrl: string | null;
      }>
    >(
      `
      SELECT refs.space_id AS "spaceId", u.id,
        CASE WHEN u.deletion_status = 'active' THEN u.name ELSE 'Deleted user' END AS name,
        CASE WHEN u.deletion_status = 'active' THEN u.photo_url ELSE NULL END AS "photoUrl"
      FROM (
        SELECT space_id, user_id FROM space_memberships WHERE space_id = ANY($1::bigint[])
        UNION SELECT space_id, added_by_user_id FROM expenses WHERE space_id = ANY($1::bigint[])
        UNION SELECT space_id, actor_user_id FROM expense_activities WHERE space_id = ANY($1::bigint[])
        UNION SELECT space_id, imported_by_user_id FROM statement_imports WHERE space_id = ANY($1::bigint[])
        UNION SELECT space_id, actor_user_id FROM statement_import_operations WHERE space_id = ANY($1::bigint[])
      ) refs JOIN users u ON u.id = refs.user_id ORDER BY refs.space_id, u.id`,
      [sharedIds],
    );
    for (const row of rows) {
      const actors = result.get(row.spaceId) ?? [];
      actors.push({ id: row.id, name: row.name, photoUrl: row.photoUrl });
      result.set(row.spaceId, actors);
    }
    return result;
  }

  async ensurePersonalSpace(userId: string): Promise<string> {
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
      return space.id;
    }

    if (membership.accessLevel !== 'write') {
      membership.accessLevel = 'write';
      await membershipRepository.save(membership);
    }

    return space.id;
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
  members: readonly SpaceMemberRecord[],
  attribution: readonly SpaceMemberRecord[],
): AccessibleSpaceRecord {
  return {
    ...toSpaceRecord(entity),
    userId,
    accessLevel,
    members,
    attribution: entity.kind === 'personal' ? members : attribution,
  };
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
