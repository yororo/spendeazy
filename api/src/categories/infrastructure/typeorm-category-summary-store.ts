import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
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
    const categoryScope = query.spaceId
      ? 'category.spaceId = :spaceId'
      : 'category.userId = :userId';
    const transactionJoin = query.spaceId
      ? 'transaction.categoryId = category.id AND transaction.spaceId = category.spaceId AND transaction.purchaseDate BETWEEN :fromDate AND :toDate'
      : 'transaction.categoryId = category.id AND transaction.userId = category.userId AND transaction.purchaseDate BETWEEN :fromDate AND :toDate';
    const scopeParameters = query.spaceId
      ? { spaceId: query.spaceId }
      : { userId: query.userId };
    const categories = await this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .leftJoin(TransactionEntity, 'transaction', transactionJoin)
      .leftJoin(BudgetEntity, 'budget', 'budget.categoryId = category.id')
      .where(categoryScope, scopeParameters)
      .andWhere('(category.isActive = TRUE OR transaction.id IS NOT NULL)')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.isActive', 'categoryIsActive')
      .addSelect('COALESCE(SUM(transaction.amount), 0)', 'totalAmount')
      .addSelect('COUNT(transaction.id)', 'transactionCount')
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

    const uncategorized = await this.entityManager
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'uncategorizedAmount')
      .addSelect('COUNT(transaction.id)', 'uncategorizedCount')
      .where(
        query.spaceId
          ? 'transaction.spaceId = :spaceId'
          : 'transaction.userId = :userId',
        scopeParameters,
      )
      .andWhere('transaction.categoryId IS NULL')
      .andWhere('transaction.purchaseDate BETWEEN :fromDate AND :toDate', {
        fromDate: query.fromDate,
        toDate: query.toDate,
      })
      .getRawOne<{
        uncategorizedAmount?: string;
        uncategorizedCount?: string;
      }>();

    return {
      categories,
      uncategorizedAmount: uncategorized?.uncategorizedAmount ?? '0.00',
      uncategorizedCount: uncategorized?.uncategorizedCount ?? '0',
    };
  }
}
