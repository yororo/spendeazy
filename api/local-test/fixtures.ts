import type { DataSource, EntityManager } from 'typeorm';

import { normalizeMatchingText } from '../src/normalization/matching-text';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import {
  LOCAL_TEST_PROFILE,
  LOCAL_TEST_USER_ID,
} from './synthetic-authentication';

export const LOCAL_TEST_FIXTURE_USER = {
  clerkUserId: LOCAL_TEST_USER_ID,
  name: LOCAL_TEST_PROFILE.fullName ?? 'Local Test User',
  email:
    LOCAL_TEST_PROFILE.primaryVerifiedEmail ??
    'local-test-user@example.invalid',
} as const;

const LOCAL_TEST_FIXTURE_CATEGORIES = [
  {
    name: 'Food & Drink',
    description: 'Fictional meals for local testing',
  },
  {
    name: 'Demo Transit',
    description: 'Fictional transport spending for local testing',
  },
  {
    name: 'Demo Home',
    description: 'Fictional home spending for local testing',
  },
  {
    name: 'Demo Fun',
    description: 'Fictional leisure spending for local testing',
  },
  {
    name: 'Demo Giving',
    description: 'Fictional giving for local testing',
  },
] as const;

const LOCAL_TEST_FIXTURE_BUDGETS = [
  { categoryName: 'Food & Drink', period: 'monthly', amount: '1800.00' },
  { categoryName: 'Demo Transit', period: 'monthly', amount: '1200.00' },
  { categoryName: 'Demo Home', period: 'monthly', amount: '2500.00' },
  { categoryName: 'Demo Fun', period: 'monthly', amount: '900.00' },
  { categoryName: 'Demo Giving', period: 'monthly', amount: '500.00' },
] as const;

const LOCAL_TEST_FIXTURE_CATEGORY_RULES = [
  {
    categoryName: 'Food & Drink',
    pattern: 'DEMO CAFE',
    matchType: 'exact',
  },
  {
    categoryName: 'Demo Transit',
    pattern: 'SAMPLE METRO',
    matchType: 'contains',
  },
  {
    categoryName: 'Demo Home',
    pattern: 'FICTIONAL MARKET',
    matchType: 'exact',
  },
  {
    categoryName: 'Demo Fun',
    pattern: 'SANDBOX CINEMA',
    matchType: 'contains',
  },
] as const;

export interface LocalTestFixtureDefinition {
  readonly user: typeof LOCAL_TEST_FIXTURE_USER;
  readonly categories: typeof LOCAL_TEST_FIXTURE_CATEGORIES;
  readonly budgets: typeof LOCAL_TEST_FIXTURE_BUDGETS;
  readonly categoryRules: typeof LOCAL_TEST_FIXTURE_CATEGORY_RULES;
  readonly transactions: readonly LocalTestFixtureTransaction[];
}

export interface LocalTestFixtureTransaction {
  readonly categoryName: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
}

export interface LocalTestFixtureCounts {
  readonly users: number;
  readonly categories: number;
  readonly budgets: number;
  readonly categoryRules: number;
  readonly transactions: number;
}

export interface LocalTestFixtureSeedResult {
  readonly seeded: boolean;
  readonly counts: LocalTestFixtureCounts;
}

export function createLocalTestFixtureDefinition(
  now = new Date(),
): LocalTestFixtureDefinition {
  return {
    user: LOCAL_TEST_FIXTURE_USER,
    categories: LOCAL_TEST_FIXTURE_CATEGORIES,
    budgets: LOCAL_TEST_FIXTURE_BUDGETS,
    categoryRules: LOCAL_TEST_FIXTURE_CATEGORY_RULES,
    transactions: [
      {
        categoryName: 'Food & Drink',
        purchaseDate: dateInCurrentMonth(3, now),
        description: 'Demo Cafe Breakfast',
        amount: '185.00',
      },
      {
        categoryName: 'Demo Transit',
        purchaseDate: dateInCurrentMonth(7, now),
        description: 'Sample Metro Ride',
        amount: '120.00',
      },
      {
        categoryName: 'Demo Home',
        purchaseDate: dateInCurrentMonth(11, now),
        description: 'Fictional Market Run',
        amount: '475.00',
      },
      {
        categoryName: 'Demo Fun',
        purchaseDate: dateInCurrentMonth(15, now),
        description: 'Sandbox Cinema',
        amount: '320.00',
      },
      {
        categoryName: 'Demo Giving',
        purchaseDate: dateInCurrentMonth(19, now),
        description: 'Test Giving',
        amount: '200.00',
      },
      {
        categoryName: null,
        purchaseDate: dateInCurrentMonth(22, now),
        description: 'Uncategorized Fixture Expense',
        amount: '90.00',
      },
    ],
  };
}

export async function ensureLocalTestFixtures(
  dataSource: DataSource,
  now = new Date(),
): Promise<LocalTestFixtureSeedResult> {
  const fixture = createLocalTestFixtureDefinition(now);

  return dataSource.transaction(async (manager) => {
    const existingFixtureUser = await manager
      .getRepository(UserEntity)
      .findOneBy({ clerkUserId: fixture.user.clerkUserId });

    if (existingFixtureUser) {
      return { seeded: false, counts: fixtureCounts(fixture) };
    }

    const existingUsers = await manager.getRepository(UserEntity).count();
    if (existingUsers > 0) {
      throw new Error(
        'The dedicated local test database contains another User; use the explicit local test reset before restoring fixtures',
      );
    }

    return {
      seeded: true,
      counts: await insertLocalTestFixtures(manager, fixture),
    };
  });
}

export async function resetLocalTestFixtures(
  dataSource: DataSource,
  now = new Date(),
): Promise<LocalTestFixtureSeedResult> {
  const fixture = createLocalTestFixtureDefinition(now);

  return dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .delete()
      .from(TransactionEntity)
      .execute();
    await manager
      .createQueryBuilder()
      .delete()
      .from(CategoryRuleEntity)
      .execute();
    await manager.createQueryBuilder().delete().from(BudgetEntity).execute();
    await manager
      .createQueryBuilder()
      .delete()
      .from(StatementImportEntity)
      .execute();
    await manager.createQueryBuilder().delete().from(CategoryEntity).execute();
    await manager.createQueryBuilder().delete().from(UserEntity).execute();

    return {
      seeded: true,
      counts: await insertLocalTestFixtures(manager, fixture),
    };
  });
}

async function insertLocalTestFixtures(
  manager: EntityManager,
  fixture: LocalTestFixtureDefinition,
): Promise<LocalTestFixtureCounts> {
  const user = await manager.save(manager.create(UserEntity, fixture.user));
  const categories = await manager.save(
    fixture.categories.map((category) =>
      manager.create(CategoryEntity, {
        userId: user.id,
        name: category.name,
        description: category.description,
        isActive: true,
      }),
    ),
  );
  const categoriesByName = new Map(
    categories.map((category) => [category.name, category]),
  );

  await manager.save(
    fixture.budgets.map((budget) =>
      manager.create(BudgetEntity, {
        categoryId: requireCategory(categoriesByName, budget.categoryName).id,
        period: budget.period,
        amount: budget.amount,
      }),
    ),
  );

  await manager.save(
    fixture.categoryRules.map((rule) =>
      manager.create(CategoryRuleEntity, {
        userId: user.id,
        categoryId: requireCategory(categoriesByName, rule.categoryName).id,
        pattern: rule.pattern,
        normalizedPattern: normalizeMatchingText(rule.pattern),
        matchType: rule.matchType,
      }),
    ),
  );

  await manager.save(
    fixture.transactions.map((transaction) =>
      manager.create(TransactionEntity, {
        userId: user.id,
        categoryId:
          transaction.categoryName === null
            ? null
            : requireCategory(categoriesByName, transaction.categoryName).id,
        statementImportId: null,
        purchaseDate: transaction.purchaseDate,
        description: transaction.description,
        amount: transaction.amount,
        categoryMatchConfidence: null,
        importFingerprint: null,
      }),
    ),
  );

  return fixtureCounts(fixture);
}

function fixtureCounts(
  fixture: LocalTestFixtureDefinition,
): LocalTestFixtureCounts {
  return {
    users: 1,
    categories: fixture.categories.length,
    budgets: fixture.budgets.length,
    categoryRules: fixture.categoryRules.length,
    transactions: fixture.transactions.length,
  };
}

function requireCategory(
  categoriesByName: Map<string, CategoryEntity>,
  name: string,
): CategoryEntity {
  const category = categoriesByName.get(name);
  if (!category) throw new Error(`Missing local test fixture Category ${name}`);
  return category;
}

function dateInCurrentMonth(day: number, now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}
