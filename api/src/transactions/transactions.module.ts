import { DynamicModule, Module } from '@nestjs/common';
import { TRANSACTION_CATEGORY_STORE } from './application/transaction-category-store';
import { TRANSACTION_STORE } from './application/transaction-store';
import { IMPORTED_TRANSACTION_STORE } from './application/imported-transaction-store';
import { TransactionsService } from './application/transactions.service';
import { TypeOrmTransactionCategoryStore } from './infrastructure/typeorm-transaction-category-store';
import { TypeOrmTransactionStore } from './infrastructure/typeorm-transaction-store';
import { TypeOrmImportedTransactionStore } from './infrastructure/typeorm-imported-transaction-store';
import { TransactionsController } from './presentation/transactions.controller';

const controllers = [TransactionsController];

@Module({})
export class TransactionsModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: TransactionsModule };
      }

      return {
        module: TransactionsModule,
        controllers,
        providers: [{ provide: TransactionsService, useValue: {} }],
      };
    }

    return {
      module: TransactionsModule,
      controllers,
      providers: [
        TypeOrmTransactionStore,
        { provide: TRANSACTION_STORE, useExisting: TypeOrmTransactionStore },
        TypeOrmTransactionCategoryStore,
        {
          provide: TRANSACTION_CATEGORY_STORE,
          useExisting: TypeOrmTransactionCategoryStore,
        },
        TypeOrmImportedTransactionStore,
        {
          provide: IMPORTED_TRANSACTION_STORE,
          useExisting: TypeOrmImportedTransactionStore,
        },
        TransactionsService,
      ],
    };
  }
}
