import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { StaleEditError } from '../../errors/application-error';
import type {
  BudgetRecord,
  BudgetStore,
  NewBudget,
  UpdateBudget,
} from '../application/budget-store';

@Injectable()
export class TypeOrmBudgetStore implements BudgetStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByCategoryId(categoryId: string): Promise<BudgetRecord | null> {
    const entity = await this.entityManager
      .getRepository(BudgetEntity)
      .findOne({ where: { categoryId } });

    return entity ? toBudgetRecord(entity) : null;
  }

  async create(input: NewBudget): Promise<BudgetRecord> {
    const repository = this.entityManager.getRepository(BudgetEntity);
    const entity = repository.create({
      categoryId: input.categoryId,
      amount: input.amount,
      period: input.period,
    });

    return saveBudget(repository, entity);
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
    const repository = this.entityManager.getRepository(BudgetEntity);
    if (input.expectedUpdatedAt !== undefined) {
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

      const updated = await repository.findOne({ where: { categoryId } });
      return updated ? toBudgetRecord(updated) : null;
    }

    const entity = await repository.findOne({ where: { categoryId } });
    if (!entity) {
      return null;
    }

    entity.amount = input.amount;
    entity.period = input.period;
    return saveBudget(repository, entity);
  }

  async delete(categoryId: string): Promise<boolean> {
    const result = await this.entityManager
      .getRepository(BudgetEntity)
      .delete({ categoryId });

    return result.affected === 1;
  }

  async deleteIfCurrent(
    categoryId: string,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    const repository = this.entityManager.getRepository(BudgetEntity);
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
      return true;
    }

    const current = await repository.findOne({ where: { categoryId } });
    if (current) {
      throw new StaleEditError();
    }

    return false;
  }
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
