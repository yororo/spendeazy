import { DynamicModule, Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { TRANSACTION_CATEGORY_STORE } from './application/transaction-category-store';
import { TRANSACTION_ACTIVITY_STORE } from './application/transaction-activity-store';
import { SPACE_TRANSACTION_STORE } from './application/transaction-store';
import { SPACE_IMPORTED_TRANSACTION_STORE } from './application/imported-transaction-store';
import { TransactionsService } from './application/transactions.service';
import { TypeOrmTransactionCategoryStore } from './infrastructure/typeorm-transaction-category-store';
import { TypeOrmTransactionActivityStore } from './infrastructure/typeorm-transaction-activity-store';
import { TypeOrmTransactionStore } from './infrastructure/typeorm-transaction-store';
import { TypeOrmImportedTransactionStore } from './infrastructure/typeorm-imported-transaction-store';
import { TransactionsController } from './presentation/transactions.controller';
import { SpaceTransactionsController } from './presentation/space-transactions.controller';

const controllers = [TransactionsController, SpaceTransactionsController];

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
        imports: [SpacesModule.register(false, options)],
        controllers,
        providers: [{ provide: TransactionsService, useValue: {} }],
      };
    }

    return {
      module: TransactionsModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmTransactionStore,
        {
          provide: SPACE_TRANSACTION_STORE,
          useExisting: TypeOrmTransactionStore,
        },
        TypeOrmTransactionCategoryStore,
        {
          provide: TRANSACTION_CATEGORY_STORE,
          useExisting: TypeOrmTransactionCategoryStore,
        },
        TypeOrmTransactionActivityStore,
        {
          provide: TRANSACTION_ACTIVITY_STORE,
          useExisting: TypeOrmTransactionActivityStore,
        },
        TypeOrmImportedTransactionStore,
        {
          provide: SPACE_IMPORTED_TRANSACTION_STORE,
          useExisting: TypeOrmImportedTransactionStore,
        },
        TransactionsService,
      ],
    };
  }
}
