import { DynamicModule, Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { EXPENSE_CATEGORY_STORE } from './application/expense-category-store';
import { EXPENSE_ACTIVITY_STORE } from './application/expense-activity-store';
import { SPACE_EXPENSE_STORE } from './application/expense-store';
import { SPACE_IMPORTED_EXPENSE_STORE } from './application/imported-expense-store';
import { ExpensesService } from './application/expenses.service';
import { TypeOrmExpenseCategoryStore } from './infrastructure/typeorm-expense-category-store';
import { TypeOrmExpenseActivityStore } from './infrastructure/typeorm-expense-activity-store';
import { TypeOrmExpenseStore } from './infrastructure/typeorm-expense-store';
import { TypeOrmImportedExpenseStore } from './infrastructure/typeorm-imported-expense-store';
import { ExpensesController } from './presentation/expenses.controller';
import { SpaceExpensesController } from './presentation/space-expenses.controller';

const controllers = [ExpensesController, SpaceExpensesController];

@Module({})
export class ExpensesModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: ExpensesModule };
      }

      return {
        module: ExpensesModule,
        imports: [SpacesModule.register(false, options)],
        controllers,
        providers: [{ provide: ExpensesService, useValue: {} }],
      };
    }

    return {
      module: ExpensesModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmExpenseStore,
        {
          provide: SPACE_EXPENSE_STORE,
          useExisting: TypeOrmExpenseStore,
        },
        TypeOrmExpenseCategoryStore,
        {
          provide: EXPENSE_CATEGORY_STORE,
          useExisting: TypeOrmExpenseCategoryStore,
        },
        TypeOrmExpenseActivityStore,
        {
          provide: EXPENSE_ACTIVITY_STORE,
          useExisting: TypeOrmExpenseActivityStore,
        },
        TypeOrmImportedExpenseStore,
        {
          provide: SPACE_IMPORTED_EXPENSE_STORE,
          useExisting: TypeOrmImportedExpenseStore,
        },
        ExpensesService,
      ],
    };
  }
}
