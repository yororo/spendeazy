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
import { TransactionActivityEntity } from './entities/transaction-activity.entity';
import { SpaceNotificationEntity } from './entities/space-notification.entity';
import { InvitationEntity } from './entities/invitation.entity';
import { InvitationClaimEntity } from './entities/invitation-claim.entity';
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
import { RemoveLegacyFinancialUserOwnership1810000000000 } from './migrations/1810000000000-remove-legacy-financial-user-ownership';
import { CreateInvitations1820000000000 } from './migrations/1820000000000-create-invitations';
import { CreateTransactionActivity1830000000000 } from './migrations/1830000000000-create-transaction-activity';
import { AddTransactionEditActivity1840000000000 } from './migrations/1840000000000-add-transaction-edit-activity';
import { RetainDeletedTransactions1850000000000 } from './migrations/1850000000000-retain-deleted-transactions';
import { RecordInvitationAcceptance1860000000000 } from './migrations/1860000000000-record-invitation-acceptance';
import { ArchiveSharedSpaces1870000000000 } from './migrations/1870000000000-archive-shared-spaces';
import { EnforceTransactionStatementImportSpace1880000000000 } from './migrations/1880000000000-enforce-transaction-statement-import-space';
import { SanitizeEmailDeliveryFailures1890000000000 } from './migrations/1890000000000-sanitize-email-delivery-failures';
import { RetireEmailInvitations1900000000000 } from './migrations/1900000000000-retire-email-invitations';
import { CreateInviteCodeInvitations1910000000000 } from './migrations/1910000000000-create-invite-code-invitations';
import { CreateInvitationClaims1920000000000 } from './migrations/1920000000000-create-invitation-claims';
import { RecordInviteCodeAcceptance1930000000000 } from './migrations/1930000000000-record-invite-code-acceptance';
import { RemoveSpaceNotificationEmailDelivery1940000000000 } from './migrations/1940000000000-remove-space-notification-email-delivery';

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
  RemoveLegacyFinancialUserOwnership1810000000000,
  CreateInvitations1820000000000,
  CreateTransactionActivity1830000000000,
  AddTransactionEditActivity1840000000000,
  RetainDeletedTransactions1850000000000,
  RecordInvitationAcceptance1860000000000,
  ArchiveSharedSpaces1870000000000,
  EnforceTransactionStatementImportSpace1880000000000,
  SanitizeEmailDeliveryFailures1890000000000,
  RetireEmailInvitations1900000000000,
  CreateInviteCodeInvitations1910000000000,
  CreateInvitationClaims1920000000000,
  RecordInviteCodeAcceptance1930000000000,
  RemoveSpaceNotificationEmailDelivery1940000000000,
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
  TransactionActivityEntity,
  SpaceNotificationEntity,
  InvitationEntity,
  InvitationClaimEntity,
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
