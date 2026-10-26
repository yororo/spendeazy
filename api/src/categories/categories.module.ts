import { DynamicModule, Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { exceptionLogger } from '../logging/exception-logger';
import { BudgetsService } from './application/budgets.service';
import { CategoriesService } from './application/categories.service';
import { CategoryConfigurationsService } from './application/category-configurations.service';
import { CATEGORY_CONFIGURATION_STORE } from './application/category-configuration-store';
import { BUDGET_STORE } from './application/budget-store';
import { CATEGORY_STORE } from './application/category-store';
import { TypeOrmBudgetStore } from './infrastructure/typeorm-budget-store';
import { TypeOrmCategoryStore } from './infrastructure/typeorm-category-store';
import { TypeOrmCategorySummaryStore } from './infrastructure/typeorm-category-summary-store';
import { TypeOrmCategoryConfigurationStore } from './infrastructure/typeorm-category-configuration-store';
import { SpaceCategoriesController } from './presentation/space-categories.controller';
import { SpaceCategoryConfigurationsController } from './presentation/space-category-configurations.controller';
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
  SpaceCategoriesController,
  SpaceCategoryConfigurationsController,
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
          { provide: CategoryConfigurationsService, useValue: {} },
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
        TypeOrmCategoryConfigurationStore,
        {
          provide: CATEGORY_CONFIGURATION_STORE,
          useExisting: TypeOrmCategoryConfigurationStore,
        },
        CategoryConfigurationsService,
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
