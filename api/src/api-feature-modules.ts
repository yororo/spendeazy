import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config/app-config';
import { CategoriesModule } from './categories/categories.module';
import { CategoryRulesModule } from './category-rules/category-rules.module';
import { StatementImportsModule } from './statement-imports/statement-imports.module';
import { ExpensesModule } from './expenses/expenses.module';
import { UsersModule } from './users/users.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ReportingModule } from './reporting/reporting.module';

export interface ApiFeatureModuleOptions {
  includeControllers?: boolean;
}

export function createApiFeatureModules(
  databaseIsConfigured: boolean,
  options: ApiFeatureModuleOptions = {},
  config?: AppConfig,
): DynamicModule[] {
  return [
    UsersModule.register(databaseIsConfigured, options),
    CategoriesModule.register(databaseIsConfigured, options),
    CategoryRulesModule.register(databaseIsConfigured, options),
    ExpensesModule.register(databaseIsConfigured, options),
    ReportingModule.register(databaseIsConfigured, options),
    StatementImportsModule.register(databaseIsConfigured, options, config),
    InvitationsModule.register(databaseIsConfigured, options, config),
  ];
}
