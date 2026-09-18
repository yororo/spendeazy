import { InjectEntityManager } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
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
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findById(id: string): Promise<UserRecord | null> {
    const entity = await this.entityManager
      .getRepository(UserEntity)
      .findOne({ where: { id } });

    return entity ? toUserRecord(entity) : null;
  }

  async findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    const entity = await this.entityManager
      .getRepository(UserEntity)
      .findOne({ where: { clerkUserId } });

    return entity ? toUserRecord(entity) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const entity = await this.entityManager
      .getRepository(UserEntity)
      .findOne({ where: { email } });

    return entity ? toUserRecord(entity) : null;
  }

  async create(input: NewUser): Promise<UserRecord> {
    const repository = this.entityManager.getRepository(UserEntity);
    const entity = repository.create({
      clerkUserId: input.clerkUserId,
      name: input.name,
      email: input.email,
    });

    return saveUser(repository, entity);
  }

  async update(id: string, input: UpdateUser): Promise<UserRecord | null> {
    const repository = this.entityManager.getRepository(UserEntity);
    const entity = await repository.findOne({ where: { id } });
    if (!entity) {
      return null;
    }

    if (input.name !== undefined) {
      entity.name = input.name;
    }
    if (input.email !== undefined) {
      entity.email = input.email;
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
  return {
    id: entity.id,
    clerkUserId: entity.clerkUserId,
    name: entity.name,
    email: entity.email,
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
