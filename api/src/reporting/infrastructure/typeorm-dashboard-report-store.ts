import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { StatementImportEntity } from '../../database/entities/statement-import.entity';
import type {
  DashboardReportCategory,
  DashboardReportData,
  DashboardReportExpense,
  DashboardReportImport,
  DashboardReportQuery,
  DashboardReportStore,
} from '../application/dashboard-report-store';

@Injectable()
export class TypeOrmDashboardReportStore implements DashboardReportStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  readDashboardReport(
    query: DashboardReportQuery,
  ): Promise<DashboardReportData> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const categories = await readCategories(manager, query.spaceId);
      const expenses = await readExpenses(manager, query);
      const imports = await readImports(manager, query);
      return { categories, expenses, imports };
    });
  }
}

async function readCategories(
  manager: EntityManager,
  spaceId: string,
): Promise<DashboardReportCategory[]> {
  const rows = await manager
    .getRepository(CategoryEntity)
    .createQueryBuilder('category')
    .leftJoin(BudgetEntity, 'budget', 'budget.categoryId = category.id')
    .where('category.spaceId = :spaceId', { spaceId })
    .select('category.id', 'categoryId')
    .addSelect('category.name', 'name')
    .addSelect('category.isActive', 'isActive')
    .addSelect('category.iconKey', 'iconKey')
    .addSelect('category.color', 'colorKey')
    .addSelect('budget.amount', 'budgetAmount')
    .addSelect('budget.period', 'budgetPeriod')
    .orderBy('category.name', 'ASC')
    .addOrderBy('category.id', 'ASC')
    .getRawMany<DashboardReportCategory>();
  return rows;
}

async function readExpenses(
  manager: EntityManager,
  query: DashboardReportQuery,
): Promise<DashboardReportExpense[]> {
  return manager
    .getRepository(ExpenseEntity)
    .createQueryBuilder('expense')
    .where('expense.spaceId = :spaceId', { spaceId: query.spaceId })
    .andWhere('expense.deletedAt IS NULL')
    .andWhere('expense.expenseDate BETWEEN :fromDate AND :toDate', {
      fromDate: query.expenseFromDate,
      toDate: query.expenseToDate,
    })
    .select('expense.categoryId', 'categoryId')
    .addSelect('CAST(expense.expenseDate AS text)', 'expenseDate')
    .addSelect('expense.amount', 'amount')
    .orderBy('expense.expenseDate', 'ASC')
    .addOrderBy('expense.id', 'ASC')
    .getRawMany<DashboardReportExpense>();
}

async function readImports(
  manager: EntityManager,
  query: DashboardReportQuery,
): Promise<DashboardReportImport[]> {
  const rows = await manager
    .getRepository(StatementImportEntity)
    .createQueryBuilder('statementImport')
    .where('statementImport.spaceId = :spaceId', { spaceId: query.spaceId })
    .andWhere('statementImport.importedAt >= :fromTimestamp', {
      fromTimestamp: query.importFromDate,
    })
    .andWhere('statementImport.importedAt < :toTimestampExclusive', {
      toTimestampExclusive: query.importToDateExclusive,
    })
    .select('statementImport.importedAt', 'importedAt')
    .orderBy('statementImport.importedAt', 'ASC')
    .getRawMany<{ importedAt: Date | string }>();
  return rows.map(({ importedAt }) => ({
    importedAt: importedAt instanceof Date ? importedAt : new Date(importedAt),
  }));
}
