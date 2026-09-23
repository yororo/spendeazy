import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config/app-config';
import { CategoriesModule } from './categories/categories.module';
import { CategoryRulesModule } from './category-rules/category-rules.module';
import { StatementImportsModule } from './statement-imports/statement-imports.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

export interface ApiFeatureModuleOptions {
  includeControllers?: boolean;
}

export function createApiFeatureModules(
  databaseIsConfigured: boolean,
  options: ApiFeatureModuleOptions = {},
  config?: AppConfig,
): DynamicModule[] {
  return [
    UsersModule.register(databaseIsConfigured, options, config),
    CategoriesModule.register(databaseIsConfigured, options),
    CategoryRulesModule.register(databaseIsConfigured, options),
    TransactionsModule.register(databaseIsConfigured, options),
    StatementImportsModule.register(databaseIsConfigured, options),
  ];
}
