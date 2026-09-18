import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { type EntityManager, type Repository } from 'typeorm';
import { BudgetEntity } from '../../database/entities/budget.entity';
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

  async update(
    categoryId: string,
    input: UpdateBudget,
  ): Promise<BudgetRecord | null> {
    const repository = this.entityManager.getRepository(BudgetEntity);
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
}

async function saveBudget(
  repository: Repository<BudgetEntity>,
  entity: BudgetEntity,
): Promise<BudgetRecord> {
  return toBudgetRecord(await repository.save(entity));
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
