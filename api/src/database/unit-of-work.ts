import { scopedTransaction } from './transaction-context';
import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { TypeOrmStatementImportStore } from '../statement-imports/infrastructure/typeorm-statement-import-store';
import { TypeOrmImportedExpenseStore } from '../expenses/infrastructure/typeorm-imported-expense-store';
import { TypeOrmExpenseCategoryStore } from '../expenses/infrastructure/typeorm-expense-category-store';
import { TypeOrmUserStore } from '../users/infrastructure/typeorm-user-store';
import { TypeOrmExpenseActivityStore } from '../expenses/infrastructure/typeorm-expense-activity-store';

import {
  type StatementImportConfirmationContext,
  type StatementImportConfirmationUnitOfWork,
} from '../statement-imports/application/statement-import-confirmation';

function createStatementImportConfirmationContext(
  entityManager: EntityManager,
): StatementImportConfirmationContext {
  const statementImports = new TypeOrmStatementImportStore(entityManager);

  return {
    users: new TypeOrmUserStore(entityManager),
    categories: new TypeOrmExpenseCategoryStore(entityManager, true),
    statementImports,
    importedExpenses: new TypeOrmImportedExpenseStore(entityManager),
    expenseActivities: new TypeOrmExpenseActivityStore(entityManager),
    spaces: statementImports,
  };
}

@Injectable()
export class TypeOrmStatementImportConfirmationUnitOfWork implements StatementImportConfirmationUnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  execute<TResult>(
    work: (context: StatementImportConfirmationContext) => Promise<TResult>,
  ): Promise<TResult> {
    return scopedTransaction(this.dataSource, (entityManager) =>
      work(createStatementImportConfirmationContext(entityManager)),
    );
  }
}
