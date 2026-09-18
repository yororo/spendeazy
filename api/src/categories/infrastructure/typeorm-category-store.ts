import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../database/database-error-codes';
import { CategoryEntity } from '../../database/entities/category.entity';
import {
  CategoryNameConflictError,
  CategoryOwnerNotFoundError,
} from '../application/category-errors';
import type {
  CategoryRecord,
  CategoryStore,
  NewCategory,
  UpdateCategory,
} from '../application/category-store';

@Injectable()
export class TypeOrmCategoryStore implements CategoryStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findById(userId: string, id: string): Promise<CategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .findOne({ where: { id, userId } });

    return entity ? toCategoryRecord(entity) : null;
  }

  async findAll(userId: string): Promise<CategoryRecord[]> {
    const entities = await this.entityManager
      .getRepository(CategoryEntity)
      .find({
        where: { userId },
        order: { id: 'ASC' },
      });

    return entities.map(toCategoryRecord);
  }

  async findByNormalizedName(
    userId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .where('category.user_id = :userId', { userId })
      .andWhere('LOWER(category.name) = :normalizedName', {
        normalizedName,
      })
      .getOne();

    return entity ? toCategoryRecord(entity) : null;
  }

  async create(input: NewCategory): Promise<CategoryRecord> {
    const repository = this.entityManager.getRepository(CategoryEntity);
    const entity = repository.create({
      userId: input.userId,
      name: input.name,
      description: input.description,
      color: input.color ?? null,
    });

    return saveCategory(repository, entity);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord | null> {
    const repository = this.entityManager.getRepository(CategoryEntity);
    const entity = await repository.findOne({ where: { id, userId } });
    if (!entity) {
      return null;
    }

    if (input.name !== undefined) {
      entity.name = input.name;
    }
    if (input.isActive !== undefined) {
      entity.isActive = input.isActive;
    }
    if (input.description !== undefined) {
      entity.description = input.description;
    }
    if (input.color !== undefined) {
      entity.color = input.color;
    }

    return saveCategory(repository, entity);
  }
}

async function saveCategory(
  repository: Repository<CategoryEntity>,
  entity: CategoryEntity,
): Promise<CategoryRecord> {
  try {
    return toCategoryRecord(await repository.save(entity));
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new CategoryNameConflictError();
    }
    if (isForeignKeyViolation(error)) {
      throw new CategoryOwnerNotFoundError();
    }

    throw error;
  }
}

function toCategoryRecord(entity: CategoryEntity): CategoryRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    name: entity.name,
    description: entity.description,
    color: entity.color,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}

function isForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_FOREIGN_KEY_VIOLATION;
}
