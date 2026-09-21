import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/app-config';
import { CategoryEntity } from './entities/category.entity';
import { BudgetEntity } from './entities/budget.entity';
import { CategoryRuleEntity } from './entities/category-rule.entity';
import { StatementImportEntity } from './entities/statement-import.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { UserEntity } from './entities/user.entity';
import { SpaceEntity } from './entities/space.entity';
import { SpaceMembershipEntity } from './entities/space-membership.entity';
import { CreateExpenseTrackerSchema1710000000000 } from './migrations/1710000000000-create-expense-tracker-schema';
import { SupportContainsCategoryRules1720000000000 } from './migrations/1720000000000-support-contains-category-rules';
import { RemoveStatementImportAccountLast41730000000000 } from './migrations/1730000000000-remove-statement-import-account-last4';
import { AddCategoryColor1740000000000 } from './migrations/1740000000000-add-category-color';
import { IntroducePersonalSpaces1750000000000 } from './migrations/1750000000000-introduce-personal-spaces';
import { ScopeCategoryNamesToSpaces1760000000000 } from './migrations/1760000000000-scope-category-names-to-spaces';
import { ScopeCategoryRulesToSpaces1770000000000 } from './migrations/1770000000000-scope-category-rules-to-spaces';
import { ScopeStatementImportDuplicatesToSpaces1780000000000 } from './migrations/1780000000000-scope-statement-import-duplicates-to-spaces';
import { RemoveLegacyFinancialReferenceConstraints1790000000000 } from './migrations/1790000000000-remove-legacy-financial-reference-constraints';
import { RemoveLegacyFinancialProvisioningTriggers1800000000000 } from './migrations/1800000000000-remove-legacy-financial-provisioning-triggers';

export const DATABASE_MIGRATIONS = [
  CreateExpenseTrackerSchema1710000000000,
  SupportContainsCategoryRules1720000000000,
  RemoveStatementImportAccountLast41730000000000,
  AddCategoryColor1740000000000,
  IntroducePersonalSpaces1750000000000,
  ScopeCategoryNamesToSpaces1760000000000,
  ScopeCategoryRulesToSpaces1770000000000,
  ScopeStatementImportDuplicatesToSpaces1780000000000,
  RemoveLegacyFinancialReferenceConstraints1790000000000,
  RemoveLegacyFinancialProvisioningTriggers1800000000000,
];

export const DATABASE_ENTITIES = [
  UserEntity,
  CategoryEntity,
  BudgetEntity,
  StatementImportEntity,
  TransactionEntity,
  CategoryRuleEntity,
  SpaceEntity,
  SpaceMembershipEntity,
];

export function createTypeOrmOptions(config: AppConfig): DataSourceOptions {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for TypeORM');
  }

  return {
    type: 'postgres',
    url: config.databaseUrl,
    entities: DATABASE_ENTITIES,
    migrations: DATABASE_MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'all',
    migrationsRun: false,
    synchronize: false,
    logging: false,
  };
}
