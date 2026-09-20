import { DynamicModule, Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { exceptionLogger } from '../logging/exception-logger';
import { BudgetsService } from './application/budgets.service';
import { CategoriesService } from './application/categories.service';
import { BUDGET_STORE } from './application/budget-store';
import { CATEGORY_STORE } from './application/category-store';
import { TypeOrmBudgetStore } from './infrastructure/typeorm-budget-store';
import { TypeOrmCategoryStore } from './infrastructure/typeorm-category-store';
import { TypeOrmCategorySummaryStore } from './infrastructure/typeorm-category-summary-store';
import { BudgetsController } from './presentation/budgets.controller';
import { CategoriesController } from './presentation/categories.controller';
import { CategorySummariesController } from './presentation/category-summaries.controller';
import { SpaceCategoriesController } from './presentation/space-categories.controller';
import { SpaceBudgetsController } from './presentation/space-budgets.controller';
import { SpaceCategorySummariesController } from './presentation/space-category-summaries.controller';
import { CategorySummariesService } from './application/category-summaries.service';
import { CATEGORY_SUMMARY_STORE } from './application/category-summary-store';
import {
  DEFAULT_CATEGORIES_LOGGER,
  DEFAULT_CATEGORY_PROVISIONER,
  DefaultCategoriesService,
} from './application/default-categories.service';

const controllers = [
  CategoriesController,
  BudgetsController,
  CategorySummariesController,
  SpaceCategoriesController,
  SpaceBudgetsController,
  SpaceCategorySummariesController,
];

@Module({})
export class CategoriesModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: CategoriesModule };
      }

      return {
        module: CategoriesModule,
        imports: [SpacesModule.register(false, options)],
        controllers,
        providers: [
          { provide: CategoriesService, useValue: {} },
          { provide: BudgetsService, useValue: {} },
          { provide: CategorySummariesService, useValue: {} },
        ],
      };
    }

    return {
      module: CategoriesModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmCategoryStore,
        { provide: CATEGORY_STORE, useExisting: TypeOrmCategoryStore },
        CategoriesService,
        TypeOrmBudgetStore,
        { provide: BUDGET_STORE, useExisting: TypeOrmBudgetStore },
        BudgetsService,
        TypeOrmCategorySummaryStore,
        {
          provide: CATEGORY_SUMMARY_STORE,
          useExisting: TypeOrmCategorySummaryStore,
        },
        CategorySummariesService,
        {
          provide: DEFAULT_CATEGORIES_LOGGER,
          useValue: exceptionLogger,
        },
        DefaultCategoriesService,
        {
          provide: DEFAULT_CATEGORY_PROVISIONER,
          useExisting: DefaultCategoriesService,
        },
      ],
      exports: [DEFAULT_CATEGORY_PROVISIONER],
    };
  }
}
