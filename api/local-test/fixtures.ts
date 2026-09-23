import { In, type DataSource, type EntityManager } from 'typeorm';

import { normalizeMatchingText } from '../src/normalization/matching-text';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { TransactionActivityEntity } from '../src/database/entities/transaction-activity.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';
import {
  LOCAL_TEST_PROFILE,
  LOCAL_TEST_SECONDARY_PROFILE,
  LOCAL_TEST_SECONDARY_USER_ID,
  LOCAL_TEST_USER_ID,
} from './synthetic-authentication';

export const LOCAL_TEST_FIXTURE_USER = {
  clerkUserId: LOCAL_TEST_USER_ID,
  name: LOCAL_TEST_PROFILE.fullName ?? 'Local Test User',
  email:
    LOCAL_TEST_PROFILE.primaryVerifiedEmail ??
    'local-test-user@example.invalid',
} as const;

export const LOCAL_TEST_SECONDARY_FIXTURE_USER = {
  clerkUserId: LOCAL_TEST_SECONDARY_USER_ID,
  name: LOCAL_TEST_SECONDARY_PROFILE.fullName ?? 'Local Test Companion',
  email:
    LOCAL_TEST_SECONDARY_PROFILE.primaryVerifiedEmail ??
    'local-test-companion@example.invalid',
} as const;

export const LOCAL_TEST_FIXTURE_USERS = [
  LOCAL_TEST_FIXTURE_USER,
  LOCAL_TEST_SECONDARY_FIXTURE_USER,
] as const;

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

const LOCAL_TEST_SECONDARY_FIXTURE_CATEGORIES = [
  {
    name: 'Companion Dining',
    description: 'Fictional meals for the second local User',
  },
  {
    name: 'Companion Travel',
    description: 'Fictional travel spending for the second local User',
  },
  {
    name: 'Companion Home',
    description: 'Fictional home spending for the second local User',
  },
] as const;

const LOCAL_TEST_SECONDARY_FIXTURE_BUDGETS = [
  { categoryName: 'Companion Dining', period: 'monthly', amount: '1400.00' },
  { categoryName: 'Companion Travel', period: 'monthly', amount: '2100.00' },
  { categoryName: 'Companion Home', period: 'monthly', amount: '1750.00' },
] as const;

const LOCAL_TEST_SECONDARY_FIXTURE_CATEGORY_RULES = [
  {
    categoryName: 'Companion Dining',
    pattern: 'COMPANION CAFE',
    matchType: 'exact',
  },
  {
    categoryName: 'Companion Travel',
    pattern: 'BLUE LINE',
    matchType: 'contains',
  },
] as const;

export interface LocalTestFixtureDefinition {
  readonly users: typeof LOCAL_TEST_FIXTURE_USERS;
  readonly user: typeof LOCAL_TEST_FIXTURE_USER;
  readonly categories: typeof LOCAL_TEST_FIXTURE_CATEGORIES;
  readonly budgets: typeof LOCAL_TEST_FIXTURE_BUDGETS;
  readonly categoryRules: typeof LOCAL_TEST_FIXTURE_CATEGORY_RULES;
  readonly transactions: readonly LocalTestFixtureTransaction[];
  readonly secondaryUser: typeof LOCAL_TEST_SECONDARY_FIXTURE_USER;
  readonly secondaryCategories: typeof LOCAL_TEST_SECONDARY_FIXTURE_CATEGORIES;
  readonly secondaryBudgets: typeof LOCAL_TEST_SECONDARY_FIXTURE_BUDGETS;
  readonly secondaryCategoryRules: typeof LOCAL_TEST_SECONDARY_FIXTURE_CATEGORY_RULES;
  readonly secondaryTransactions: readonly LocalTestFixtureTransaction[];
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
    users: LOCAL_TEST_FIXTURE_USERS,
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
    secondaryUser: LOCAL_TEST_SECONDARY_FIXTURE_USER,
    secondaryCategories: LOCAL_TEST_SECONDARY_FIXTURE_CATEGORIES,
    secondaryBudgets: LOCAL_TEST_SECONDARY_FIXTURE_BUDGETS,
    secondaryCategoryRules: LOCAL_TEST_SECONDARY_FIXTURE_CATEGORY_RULES,
    secondaryTransactions: [
      {
        categoryName: 'Companion Dining',
        purchaseDate: dateInCurrentMonth(4, now),
        description: 'Companion Cafe Lunch',
        amount: '240.00',
      },
      {
        categoryName: 'Companion Travel',
        purchaseDate: dateInCurrentMonth(9, now),
        description: 'Blue Line Journey',
        amount: '155.00',
      },
      {
        categoryName: 'Companion Home',
        purchaseDate: dateInCurrentMonth(14, now),
        description: 'Companion Home Supply',
        amount: '390.00',
      },
      {
        categoryName: null,
        purchaseDate: dateInCurrentMonth(18, now),
        description: 'Companion Uncategorized Expense',
        amount: '75.00',
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
    const userRepository = manager.getRepository(UserEntity);
    const existingUsers = await userRepository.count();
    const existingPrimaryUser = await userRepository.findOneBy({
      clerkUserId: fixture.user.clerkUserId,
    });
    const existingSecondaryUser = await userRepository.findOneBy({
      clerkUserId: fixture.secondaryUser.clerkUserId,
    });

    if (existingPrimaryUser && existingSecondaryUser) {
      await ensureLocalTestSharedSpace(
        manager,
        existingPrimaryUser.id,
        existingSecondaryUser.id,
      );
      return { seeded: false, counts: fixtureCounts(fixture) };
    }

    if (existingUsers === 0) {
      return {
        seeded: true,
        counts: await insertLocalTestFixtures(manager, fixture),
      };
    }

    if (existingUsers === 1 && existingPrimaryUser && !existingSecondaryUser) {
      await insertLocalTestFixture(manager, {
        user: fixture.secondaryUser,
        categories: fixture.secondaryCategories,
        budgets: fixture.secondaryBudgets,
        categoryRules: fixture.secondaryCategoryRules,
        transactions: fixture.secondaryTransactions,
      });
      const insertedSecondaryUser = await userRepository.findOneBy({
        clerkUserId: fixture.secondaryUser.clerkUserId,
      });
      if (!insertedSecondaryUser) {
        throw new Error('The local test secondary User could not be restored');
      }
      await ensureLocalTestSharedSpace(
        manager,
        existingPrimaryUser.id,
        insertedSecondaryUser.id,
      );
      return { seeded: true, counts: fixtureCounts(fixture) };
    }

    if (existingUsers > 0) {
      throw new Error(
        'The dedicated local test database does not contain both fictional Users; use the explicit local test reset before restoring fixtures',
      );
    }

    throw new Error('The dedicated local test fixtures could not be prepared');
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
      .from(TransactionActivityEntity)
      .execute();
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
    await manager
      .createQueryBuilder()
      .delete()
      .from(SpaceMembershipEntity)
      .execute();
    await manager.createQueryBuilder().delete().from(SpaceEntity).execute();
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
  const primary = await insertLocalTestFixture(manager, {
    user: fixture.user,
    categories: fixture.categories,
    budgets: fixture.budgets,
    categoryRules: fixture.categoryRules,
    transactions: fixture.transactions,
  });
  const secondary = await insertLocalTestFixture(manager, {
    user: fixture.secondaryUser,
    categories: fixture.secondaryCategories,
    budgets: fixture.secondaryBudgets,
    categoryRules: fixture.secondaryCategoryRules,
    transactions: fixture.secondaryTransactions,
  });
  await ensureLocalTestSharedSpace(manager, primary.userId, secondary.userId);

  return fixtureCounts(fixture);
}

interface LocalTestFixtureScenario {
  readonly user: {
    readonly clerkUserId: string;
    readonly name: string;
    readonly email: string;
  };
  readonly categories: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly budgets: readonly {
    readonly categoryName: string;
    readonly period: 'monthly' | 'yearly';
    readonly amount: string;
  }[];
  readonly categoryRules: readonly {
    readonly categoryName: string;
    readonly pattern: string;
    readonly matchType: 'exact' | 'contains';
  }[];
  readonly transactions: readonly LocalTestFixtureTransaction[];
}

async function insertLocalTestFixture(
  manager: EntityManager,
  fixture: LocalTestFixtureScenario,
): Promise<{ userId: string }> {
  const user = await manager.save(manager.create(UserEntity, fixture.user));
  const spaceId = await new TypeOrmSpaceStore(manager).ensurePersonalSpace(
    user.id,
  );
  const categories = await manager.save(
    fixture.categories.map((category) =>
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
        spaceId,
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
        spaceId,
        addedByUserId: user.id,
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

  return { userId: user.id };
}

async function ensureLocalTestSharedSpace(
  manager: EntityManager,
  primaryUserId: string,
  secondaryUserId: string,
): Promise<void> {
  const spaceRepository = manager.getRepository(SpaceEntity);
  const membershipRepository = manager.getRepository(SpaceMembershipEntity);
  const userRepository = manager.getRepository(UserEntity);
  const sharedSpace =
    (await spaceRepository.findOne({
      where: { kind: 'shared', status: 'active' },
    })) ??
    (await spaceRepository.save(
      spaceRepository.create({
        kind: 'shared',
        status: 'active',
        personalOwnerUserId: null,
      }),
    ));

  for (const userId of [primaryUserId, secondaryUserId]) {
    const membership = await membershipRepository.findOne({
      where: { spaceId: sharedSpace.id, userId },
    });
    if (membership) {
      if (membership.accessLevel !== 'write') {
        membership.accessLevel = 'write';
        await membershipRepository.save(membership);
      }
    } else {
      await membershipRepository.save(
        membershipRepository.create({
          spaceId: sharedSpace.id,
          userId,
          accessLevel: 'write',
        }),
      );
    }
  }

  const users = await userRepository.findBy({
    id: In([primaryUserId, secondaryUserId]),
  });
  for (const user of users) {
    if (user.activeSharedSpaceId !== sharedSpace.id) {
      user.activeSharedSpaceId = sharedSpace.id;
      await userRepository.save(user);
    }
  }
}

function fixtureCounts(
  fixture: LocalTestFixtureDefinition,
): LocalTestFixtureCounts {
  return {
    users: fixture.users.length,
    categories: fixture.categories.length + fixture.secondaryCategories.length,
    budgets: fixture.budgets.length + fixture.secondaryBudgets.length,
    categoryRules:
      fixture.categoryRules.length + fixture.secondaryCategoryRules.length,
    transactions:
      fixture.transactions.length + fixture.secondaryTransactions.length,
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
