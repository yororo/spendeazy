import { transactionManager } from '../../database/transaction-context';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import {
  IsNull,
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { AccountDeletionOperationEntity } from '../../database/entities/account-deletion-operation.entity';
import type { AccountDeletionOperationRecord } from '../application/account-deletion-operation';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { UserEmailConflictError } from '../application/user-errors';
import type {
  NewUser,
  UpdateUser,
  UserRecord,
  UserStore,
} from '../application/user-store';

@Injectable()
export class TypeOrmUserStore implements UserStore {
  get entityManager(): EntityManager {
    return transactionManager(this.baseEntityManager);
  }
  constructor(
    @InjectEntityManager()
    private readonly baseEntityManager: EntityManager,
  ) {}

  async findDeletionOperationByClerkUserId(
    clerkUserId: string,
  ): Promise<AccountDeletionOperationRecord | null> {
    const entity = await this.entityManager
      .getRepository(AccountDeletionOperationEntity)
      .findOne({ where: { oldClerkUserId: clerkUserId } });
    return entity ? { ...entity } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const entity = await this.entityManager.getRepository(UserEntity).findOne({
      where: { id, deletionStatus: 'active', deletedAt: IsNull() },
    });

    return entity ? toUserRecord(entity) : null;
  }

  async findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    const entity = await this.entityManager.getRepository(UserEntity).findOne({
      where: { clerkUserId, deletionStatus: 'active', deletedAt: IsNull() },
    });

    return entity ? toUserRecord(entity) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const entity = await this.entityManager.getRepository(UserEntity).findOne({
      where: { email, deletionStatus: 'active', deletedAt: IsNull() },
    });

    return entity ? toUserRecord(entity) : null;
  }

  async create(input: NewUser): Promise<UserRecord> {
    const repository = this.entityManager.getRepository(UserEntity);
    const entity = repository.create({
      clerkUserId: input.clerkUserId,
      name: input.name,
      email: input.email,
      photoUrl: input.photoUrl ?? null,
      deletionStatus: 'active',
      deletedAt: null,
    });

    return saveUser(repository, entity);
  }

  async update(id: string, input: UpdateUser): Promise<UserRecord | null> {
    const repository = this.entityManager.getRepository(UserEntity);
    const entity = await repository.findOne({
      where: { id, deletionStatus: 'active', deletedAt: IsNull() },
    });
    if (!entity) {
      return null;
    }

    if (input.name !== undefined) {
      entity.name = input.name;
    }
    if (input.email !== undefined) {
      entity.email = input.email;
    }
    if (input.photoUrl !== undefined) {
      entity.photoUrl = input.photoUrl;
    }

    return saveUser(repository, entity);
  }
}

async function saveUser(
  repository: Repository<UserEntity>,
  entity: UserEntity,
): Promise<UserRecord> {
  try {
    return toUserRecord(await repository.save(entity));
  } catch (error: unknown) {
    throw mapUserStoreError(error);
  }
}

function toUserRecord(entity: UserEntity): UserRecord {
  // Only active Users are projected; nullable email belongs to scrubbed tombstones.
  if (entity.email === null) throw new Error('Active User must have an email');
  return {
    id: entity.id,
    clerkUserId: entity.clerkUserId,
    name: entity.name,
    email: entity.email,
    photoUrl: entity.photoUrl,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapUserStoreError(error: unknown): unknown {
  if (isUniqueViolation(error)) {
    return new UserEmailConflictError();
  }

  return error;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}
