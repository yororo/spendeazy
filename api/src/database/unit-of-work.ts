import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmStatementImportStore } from '../statement-imports/infrastructure/typeorm-statement-import-store';
import type { StatementImportStore } from '../statement-imports/application/statement-import-store';
import { TypeOrmImportedTransactionStore } from '../transactions/infrastructure/typeorm-imported-transaction-store';
import type { ImportedTransactionStore } from '../transactions/application/imported-transaction-store';
import { TypeOrmTransactionCategoryStore } from '../transactions/infrastructure/typeorm-transaction-category-store';
import type { TransactionCategoryStore } from '../transactions/application/transaction-category-store';
import { TypeOrmUserStore } from '../users/infrastructure/typeorm-user-store';
import type { UserStore } from '../users/application/user-store';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface TransactionContext {
  readonly entityManager: EntityManager;
  readonly users: UserStore;
  readonly categories: TransactionCategoryStore;
  readonly statementImports: StatementImportStore;
  readonly importedTransactions: ImportedTransactionStore;
}

export interface UnitOfWork {
  execute<TResult>(
    work: (context: TransactionContext) => Promise<TResult>,
  ): Promise<TResult>;
}

export function createTransactionContext(
  entityManager: EntityManager,
): TransactionContext {
  return {
    entityManager,
    users: new TypeOrmUserStore(entityManager),
    categories: new TypeOrmTransactionCategoryStore(entityManager, true),
    statementImports: new TypeOrmStatementImportStore(entityManager),
    importedTransactions: new TypeOrmImportedTransactionStore(entityManager),
  };
}

@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  execute<TResult>(
    work: (context: TransactionContext) => Promise<TResult>,
  ): Promise<TResult> {
    return this.dataSource.transaction((entityManager) =>
      work(createTransactionContext(entityManager)),
    );
  }
}
