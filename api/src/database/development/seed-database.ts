import type { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { BudgetEntity } from '../entities/budget.entity';
import { CategoryRuleEntity } from '../entities/category-rule.entity';
import { CategoryEntity } from '../entities/category.entity';
import { StatementImportEntity } from '../entities/statement-import.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { UserEntity } from '../entities/user.entity';
import { SpaceEntity } from '../entities/space.entity';
import { normalizeMatchingText } from '../../normalization/matching-text';
import { TypeOrmSpaceStore } from '../../spaces/infrastructure/typeorm-space-store';
import {
  dateInCurrentMonth,
  SEED_CATEGORIES,
  SEED_CATEGORY_BUDGETS,
  SEED_CATEGORY_RULES,
  SEED_USER,
  sha256,
} from './seed-scenario';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

interface SeedCounts {
  users: number;
  categories: number;
  budgets: number;
  categoryRules: number;
  statementImports: number;
  transactions: number;
}

async function main(): Promise<void> {
  const shouldReset = process.argv.includes('--reset');
  const target = validateLocalDevelopmentTarget();

  console.log(
    `${shouldReset ? 'Resetting and seeding' : 'Seeding'} PostgreSQL database ${target.database} on ${target.host}`,
  );

  await AppDataSource.initialize();
  try {
    if (shouldReset) {
      await AppDataSource.dropDatabase();
    }

    await AppDataSource.runMigrations();
    printSeedSummary(await seedDatabase(AppDataSource));
  } finally {
    await AppDataSource.destroy();
  }
}

function validateLocalDevelopmentTarget(): { host: string; database: string } {
  const environment = process.env.NODE_ENV?.trim() || 'development';
  if (environment.toLowerCase() === 'production') {
    throw new Error('Database seed commands are disabled in production');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for database seed commands');
  }

  const parsedUrl = new URL(databaseUrl);
  if (!LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error(
      `Database seed commands require a loopback host; received ${parsedUrl.hostname}`,
    );
  }

  return { host: parsedUrl.hostname, database: parsedUrl.pathname.slice(1) };
}

async function seedDatabase(dataSource: DataSource): Promise<SeedCounts> {
  return dataSource.transaction(async (manager) => {
    await removeExistingSeedUser(manager);
    return createSeedScenario(manager);
  });
}

async function removeExistingSeedUser(manager: EntityManager): Promise<void> {
  const seedUser = await manager
    .getRepository(UserEntity)
    .createQueryBuilder('user')
    .where('LOWER(user.email) = LOWER(:email)', { email: SEED_USER.email })
    .getOne();

  if (!seedUser) return;

  const personalSpace = await manager.findOne(SpaceEntity, {
    where: { personalOwnerUserId: seedUser.id },
  });
  if (!personalSpace) {
    await manager.delete(UserEntity, { id: seedUser.id });
    return;
  }
  await manager.delete(TransactionEntity, { spaceId: personalSpace.id });
  await manager.delete(CategoryRuleEntity, { spaceId: personalSpace.id });
  await manager
    .createQueryBuilder()
    .delete()
    .from(BudgetEntity)
    .where(
      'category_id IN (SELECT id FROM categories WHERE space_id = :spaceId)',
      { spaceId: personalSpace.id },
    )
    .execute();
  await manager.delete(StatementImportEntity, { spaceId: personalSpace.id });
  await manager.delete(CategoryEntity, { spaceId: personalSpace.id });
  await manager.delete(SpaceEntity, { id: personalSpace.id });
  await manager.delete(UserEntity, { id: seedUser.id });
}

async function createSeedScenario(manager: EntityManager): Promise<SeedCounts> {
  const user = await manager.save(
    manager.create(UserEntity, {
      name: SEED_USER.name,
      email: SEED_USER.email,
      clerkUserId: SEED_USER.clerkUserId,
    }),
  );
  const spaceId = await new TypeOrmSpaceStore(manager).ensurePersonalSpace(
    user.id,
  );
  const categories = await manager.save(
    SEED_CATEGORIES.map((category) =>
      manager.create(CategoryEntity, {
        spaceId,
        name: category.name,
        description: category.description,
        isActive: true,
      }),
    ),
  );
  const categoriesByName = new Map(
    categories.map((category) => [category.name, category]),
  );
  const budgetsByCategoryName = new Map<string, string>(
    SEED_CATEGORY_BUDGETS.map(({ categoryName, monthlyBudget }) => [
      categoryName,
      monthlyBudget,
    ]),
  );

  await manager.save(
    categories.map((category) => {
      const monthlyBudget = budgetsByCategoryName.get(category.name);
      if (monthlyBudget === undefined)
        throw new Error(`Missing seed budget for category ${category.name}`);
      return manager.create(BudgetEntity, {
        categoryId: category.id,
        period: 'monthly',
        amount: monthlyBudget,
      });
    }),
  );

  const appSubscriptions = requireCategory(
    categoriesByName,
    'App Subscriptions',
  );
  const categoryRules = await manager.save(
    SEED_CATEGORY_RULES.map(({ categoryName, pattern }) => {
      const category = requireCategory(categoriesByName, categoryName);
      return manager.create(CategoryRuleEntity, {
        spaceId,
        categoryId: category.id,
        pattern,
        normalizedPattern: normalizeMatchingText(pattern),
        matchType: 'exact',
      });
    }),
  );

  const statementImport = await manager.save(
    manager.create(StatementImportEntity, {
      spaceId,
      importedByUserId: user.id,
      fileName: 'dev-credit-card-statement.pdf',
      fileHash: sha256('spendeazy deterministic development statement'),
      statementDate: dateInCurrentMonth(20),
      bank: 'Development Bank',
      cardType: 'visa',
    }),
  );

  await manager.save([
    createTransaction(
      manager,
      spaceId,
      user.id,
      requireCategory(categoriesByName, 'Groceries').id,
      null,
      3,
      'Grocery shopping',
      '1250.00',
      null,
      null,
    ),
    createTransaction(
      manager,
      spaceId,
      user.id,
      null,
      null,
      8,
      'Cash expense',
      '300.00',
      null,
      null,
    ),
    createTransaction(
      manager,
      spaceId,
      user.id,
      appSubscriptions.id,
      statementImport.id,
      12,
      'Netflix',
      '549.00',
      '1.0000',
      sha256('netflix|549.00|development-import'),
    ),
    createTransaction(
      manager,
      spaceId,
      user.id,
      requireCategory(categoriesByName, 'Commute').id,
      statementImport.id,
      18,
      'Grab',
      '275.00',
      null,
      sha256('grab|275.00|development-import'),
    ),
  ]);

  return {
    users: 1,
    categories: categories.length,
    budgets: SEED_CATEGORY_BUDGETS.length,
    categoryRules: categoryRules.length,
    statementImports: 1,
    transactions: 4,
  };
}

function createTransaction(
  manager: EntityManager,
  spaceId: string,
  addedByUserId: string,
  categoryId: string | null,
  statementImportId: string | null,
  day: number,
  description: string,
  amount: string,
  categoryMatchConfidence: string | null,
  importFingerprint: string | null,
): TransactionEntity {
  return manager.create(TransactionEntity, {
    spaceId,
    addedByUserId,
    categoryId,
    statementImportId,
    purchaseDate: dateInCurrentMonth(day),
    description,
    amount,
    categoryMatchConfidence,
    importFingerprint,
  });
}

function requireCategory(
  categoriesByName: Map<string, CategoryEntity>,
  name: string,
): CategoryEntity {
  const category = categoriesByName.get(name);
  if (!category) throw new Error(`Missing seed category ${name}`);
  return category;
}

function printSeedSummary(counts: SeedCounts): void {
  console.log(`Seeded ${SEED_USER.email}`);
  console.log(
    `Created ${counts.users} user, ${counts.categories} categories, ${counts.budgets} budgets, ${counts.categoryRules} category rules, ${counts.statementImports} statement import, and ${counts.transactions} transactions`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database seed failed: ${message}`);
  process.exitCode = 1;
});
