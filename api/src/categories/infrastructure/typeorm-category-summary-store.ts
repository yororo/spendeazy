import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import type {
  CategorySummaryData,
  CategorySummaryQuery,
  CategorySummaryRow,
  CategorySummaryStore,
} from '../application/category-summary-store';

@Injectable()
export class TypeOrmCategorySummaryStore implements CategorySummaryStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findSummary(query: CategorySummaryQuery): Promise<CategorySummaryData> {
    const scopeParameters = { spaceId: query.spaceId };
    const categories = await this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .leftJoin(
        ExpenseEntity,
        'expense',
        'expense.categoryId = category.id AND expense.spaceId = category.spaceId AND expense.deletedAt IS NULL AND expense.expenseDate BETWEEN :fromDate AND :toDate',
      )
      .leftJoin(BudgetEntity, 'budget', 'budget.categoryId = category.id')
      .where('category.spaceId = :spaceId', scopeParameters)
      .andWhere('(category.isActive = TRUE OR expense.id IS NOT NULL)')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.isActive', 'categoryIsActive')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'totalAmount')
      .addSelect('COUNT(expense.id)', 'expenseCount')
      .addSelect('budget.amount', 'budgetAmount')
      .addSelect('budget.period', 'budgetPeriod')
      .setParameters({
        fromDate: query.fromDate,
        toDate: query.toDate,
      })
      .groupBy('category.id')
      .addGroupBy('category.name')
      .addGroupBy('category.isActive')
      .addGroupBy('budget.id')
      .addGroupBy('budget.amount')
      .addGroupBy('budget.period')
      .orderBy('category.id', 'ASC')
      .getRawMany<CategorySummaryRow>();

    return { categories };
  }
}
