import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { TypeOrmStatementImportStore } from '../statement-imports/infrastructure/typeorm-statement-import-store';
import { TypeOrmImportedTransactionStore } from '../transactions/infrastructure/typeorm-imported-transaction-store';
import { TypeOrmTransactionCategoryStore } from '../transactions/infrastructure/typeorm-transaction-category-store';
import { TypeOrmUserStore } from '../users/infrastructure/typeorm-user-store';
import { TypeOrmTransactionActivityStore } from '../transactions/infrastructure/typeorm-transaction-activity-store';

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
    categories: new TypeOrmTransactionCategoryStore(entityManager, true),
    statementImports,
    importedTransactions: new TypeOrmImportedTransactionStore(entityManager),
    transactionActivities: new TypeOrmTransactionActivityStore(entityManager),
    spaces: statementImports,
  };
}

@Injectable()
export class TypeOrmStatementImportConfirmationUnitOfWork implements StatementImportConfirmationUnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  execute<TResult>(
    work: (context: StatementImportConfirmationContext) => Promise<TResult>,
  ): Promise<TResult> {
    return this.dataSource.transaction((entityManager) =>
      work(createStatementImportConfirmationContext(entityManager)),
    );
  }
}
