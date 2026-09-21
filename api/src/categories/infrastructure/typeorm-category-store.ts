import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import {
  QueryFailedError,
  type EntityManager,
  type Repository,
  type UpdateResult,
} from 'typeorm';
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../database/database-error-codes';
import { CategoryEntity } from '../../database/entities/category.entity';
import { StaleEditError } from '../../errors/application-error';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import { CategoryNameConflictError } from '../application/category-errors';
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

  async findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<CategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .findOne({ where: { id, spaceId } });

    return entity ? toCategoryRecord(entity) : null;
  }

  async findAllBySpaceId(spaceId: string): Promise<CategoryRecord[]> {
    const entities = await this.entityManager
      .getRepository(CategoryEntity)
      .find({
        where: { spaceId },
        order: { id: 'ASC' },
      });

    return entities.map(toCategoryRecord);
  }

  async findByNormalizedNameInSpace(
    spaceId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .where('category.space_id = :spaceId', { spaceId })
      .andWhere('LOWER(category.name) = :normalizedName', {
        normalizedName,
      })
      .getOne();

    return entity ? toCategoryRecord(entity) : null;
  }

  async create(input: NewCategory): Promise<CategoryRecord> {
    const repository = this.entityManager.getRepository(CategoryEntity);
    const entity = repository.create({
      spaceId: input.spaceId,
      name: input.name,
      description: input.description,
      color: input.color ?? null,
    });

    return saveCategory(repository, entity);
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord | null> {
    const repository = this.entityManager.getRepository(CategoryEntity);
    const changes = withoutExpectedUpdatedAt(input);

    if (input.expectedUpdatedAt !== undefined) {
      let result: UpdateResult;
      try {
        result = await repository
          .createQueryBuilder()
          .update(CategoryEntity)
          .set(changes)
          .where('id = :id', { id })
          .andWhere('space_id = :spaceId', { spaceId })
          .andWhere('updated_at = :expectedUpdatedAt', {
            expectedUpdatedAt: new Date(input.expectedUpdatedAt),
          })
          .execute();
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new CategoryNameConflictError();
        }

        throw error;
      }

      if (result.affected !== 1) {
        const current = await repository.findOne({ where: { id, spaceId } });
        if (!current) {
          return null;
        }

        throw new StaleEditError();
      }

      const updated = await repository.findOne({ where: { id, spaceId } });
      return updated ? toCategoryRecord(updated) : null;
    }

    const entity = await repository.findOne({ where: { id, spaceId } });
    if (!entity) {
      return null;
    }

    applyCategoryChanges(entity, changes);
    return saveCategory(repository, entity);
  }
}

function applyCategoryChanges(
  entity: CategoryEntity,
  input: UpdateCategory,
): void {
  if (input.name !== undefined) entity.name = input.name;
  if (input.isActive !== undefined) entity.isActive = input.isActive;
  if (input.description !== undefined) entity.description = input.description;
  if (input.color !== undefined) entity.color = input.color;
}

function withoutExpectedUpdatedAt(input: UpdateCategory): UpdateCategory {
  const changes = { ...input };
  delete changes.expectedUpdatedAt;
  return changes;
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
      throw new SpaceNotFoundError();
    }

    throw error;
  }
}

function toCategoryRecord(entity: CategoryEntity): CategoryRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
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
