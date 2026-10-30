import { transactionManager } from '../../database/transaction-context';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { StaleEditError } from '../../errors/application-error';
import { CategoryNotFoundError } from '../application/category-errors';
import { lockWritableSpace } from '../../spaces/infrastructure/space-write-guard';
import { bumpCategoryRevision } from './typeorm-category-revision';
import type {
  BudgetRecord,
  BudgetStore,
  NewBudget,
  UpdateBudget,
} from '../application/budget-store';

@Injectable()
export class TypeOrmBudgetStore implements BudgetStore {
  get entityManager(): EntityManager {
    return transactionManager(this.baseEntityManager);
  }
  constructor(
    @InjectEntityManager()
    private readonly baseEntityManager: EntityManager,
  ) {}

  async findByCategoryId(categoryId: string): Promise<BudgetRecord | null> {
    const entity = await this.entityManager
      .getRepository(BudgetEntity)
      .findOne({ where: { categoryId } });

    return entity ? toBudgetRecord(entity) : null;
  }

  async create(input: NewBudget): Promise<BudgetRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockBudgetSpace(entityManager, input.categoryId);
      const repository = entityManager.getRepository(BudgetEntity);
      const entity = repository.create({
        categoryId: input.categoryId,
        amount: input.amount,
        period: input.period,
      });
      const saved = await saveBudget(repository, entity);
      await bumpCategoryRevision(entityManager, input.categoryId);
      return saved;
    });
  }

  async createIfAbsent(input: NewBudget): Promise<BudgetRecord | null> {
    try {
      return await this.create(input);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async update(
    categoryId: string,
    input: UpdateBudget,
  ): Promise<BudgetRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockBudgetSpace(entityManager, categoryId);
      const repository = entityManager.getRepository(BudgetEntity);
      const result = await repository
        .createQueryBuilder()
        .update(BudgetEntity)
        .set({ amount: input.amount, period: input.period })
        .where('category_id = :categoryId', { categoryId })
        .andWhere('updated_at = :expectedUpdatedAt', {
          expectedUpdatedAt: new Date(input.expectedUpdatedAt),
        })
        .execute();

      if (result.affected !== 1) {
        const current = await repository.findOne({ where: { categoryId } });
        if (!current) {
          return null;
        }

        throw new StaleEditError();
      }

      await bumpCategoryRevision(entityManager, categoryId);
      const updated = await repository.findOne({ where: { categoryId } });
      return updated ? toBudgetRecord(updated) : null;
    });
  }

  async deleteIfCurrent(
    categoryId: string,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockBudgetSpace(entityManager, categoryId);
      const repository = entityManager.getRepository(BudgetEntity);
      const result = await repository
        .createQueryBuilder()
        .delete()
        .from(BudgetEntity)
        .where('category_id = :categoryId', { categoryId })
        .andWhere('updated_at = :expectedUpdatedAt', {
          expectedUpdatedAt: new Date(expectedUpdatedAt),
        })
        .execute();
      if (result.affected === 1) {
        await bumpCategoryRevision(entityManager, categoryId);
        return true;
      }

      const current = await repository.findOne({ where: { categoryId } });
      if (current) {
        throw new StaleEditError();
      }

      return false;
    });
  }
}

async function lockBudgetSpace(
  entityManager: EntityManager,
  categoryId: string,
): Promise<void> {
  const category = await entityManager
    .getRepository(CategoryEntity)
    .findOne({ where: { id: categoryId } });
  if (!category) throw new CategoryNotFoundError();
  await lockWritableSpace(entityManager, category.spaceId);
}

async function saveBudget(
  repository: Repository<BudgetEntity>,
  entity: BudgetEntity,
): Promise<BudgetRecord> {
  return toBudgetRecord(await repository.save(entity));
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}

function toBudgetRecord(entity: BudgetEntity): BudgetRecord {
  return {
    id: entity.id,
    categoryId: entity.categoryId,
    period: entity.period,
    amount: entity.amount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
