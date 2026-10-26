import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource, In, type QueryRunner } from 'typeorm';

import {
  CLERK_PROFILE_SERVICE,
  type ClerkProfileService,
  type ClerkUserProfile,
} from '../src/authentication/clerk-profile-service';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { createAppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import type { AppConfig } from '../src/config/app-config';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { ExpenseActivityEntity } from '../src/database/entities/expense-activity.entity';
import { ExpenseEntity } from '../src/database/entities/expense.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { UserEntity } from '../src/database/entities/user.entity';

const databaseUrl = process.env.TEST_SPACE_CATEGORIES_CONCURRENCY_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Space Category and Budget concurrency over authenticated HTTP with PostgreSQL',
  () => {
    let application: INestApplication;
    let database: DataSource;
    let verifier: HttpTokenVerifier;
    let profileService: HttpProfileService;
    const createdUserIds: string[] = [];
    const createdSpaceIds: string[] = [];

    beforeAll(async () => {
      verifier = new HttpTokenVerifier();
      profileService = new HttpProfileService();
      application = await NestFactory.create(
        createAppModule(testConfig(databaseUrl), {
          authentication: {
            tokenVerifier: {
              provide: CLERK_TOKEN_VERIFIER,
              useValue: verifier,
            },
            profileService: {
              provide: CLERK_PROFILE_SERVICE,
              useValue: profileService,
            },
          },
        }),
        { bodyParser: false },
      );
      configureApp(application);
      await application.init();
      database = application.get(DataSource);
      await database.runMigrations();
    });

    afterEach(async () => {
      if (!database?.isInitialized) return;

      if (createdSpaceIds.length > 0) {
        const categories = await database
          .getRepository(CategoryEntity)
          .findBy({ spaceId: In(createdSpaceIds) });
        await database.getRepository(ExpenseActivityEntity).delete({
          spaceId: In(createdSpaceIds),
        });
        await database.getRepository(ExpenseEntity).delete({
          spaceId: In(createdSpaceIds),
        });
        if (categories.length > 0) {
          await database.getRepository(BudgetEntity).delete({
            categoryId: In(categories.map((category) => category.id)),
          });
          await database.getRepository(CategoryEntity).delete({
            id: In(categories.map((category) => category.id)),
          });
        }
        await database.getRepository(SpaceMembershipEntity).delete({
          spaceId: In(createdSpaceIds),
        });
        await database.getRepository(SpaceEntity).delete({
          id: In(createdSpaceIds),
        });
      }

      if (createdUserIds.length > 0) {
        await database.getRepository(UserEntity).delete({
          id: In(createdUserIds),
        });
      }

      createdUserIds.splice(0);
      createdSpaceIds.splice(0);
      verifier.clear();
      profileService.clear();
    });

    afterAll(async () => {
      if (application) await application.close();
    });

    it('allows only one concurrent Category update, Budget replacement, and Budget creation', async () => {
      const identity = createIdentity('category-budget-concurrency');
      await provision(identity);
      const spaceId = await personalSpaceId(identity);

      const categoryId = await createCategory(identity, spaceId, 'Housing');
      const category = await getCategory(identity, spaceId, categoryId);
      const categoryUpdates = await Promise.all([
        updateCategory(
          identity,
          spaceId,
          categoryId,
          category.updatedAt,
          'Home',
        ),
        updateCategory(
          identity,
          spaceId,
          categoryId,
          category.updatedAt,
          'Household',
        ),
      ]);
      expect(categoryUpdates.map((response) => response.status).sort()).toEqual(
        [200, 409],
      );

      const replacementCategoryId = await createCategory(
        identity,
        spaceId,
        'Transport',
      );
      const createdBudget = await putBudget(
        identity,
        spaceId,
        replacementCategoryId,
        { amount: '250.00', period: 'monthly' },
      );
      expect(createdBudget.status).toBe(201);
      const budget = await getBudget(identity, spaceId, replacementCategoryId);
      const budgetBody = responseBody<BudgetResponse>(budget);
      const replacements = await Promise.all([
        putBudget(identity, spaceId, replacementCategoryId, {
          amount: '300.00',
          period: 'monthly',
          updatedAt: budgetBody.updatedAt,
        }),
        putBudget(identity, spaceId, replacementCategoryId, {
          amount: '325.00',
          period: 'monthly',
          updatedAt: budgetBody.updatedAt,
        }),
      ]);
      expect(replacements.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);

      const creationCategoryId = await createCategory(
        identity,
        spaceId,
        'Household utilities',
      );
      const creations = await Promise.all([
        putBudget(identity, spaceId, creationCategoryId, {
          amount: '100.00',
          period: 'monthly',
        }),
        putBudget(identity, spaceId, creationCategoryId, {
          amount: '125.00',
          period: 'monthly',
        }),
      ]);
      expect(creations.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);

      const deletionCategoryId = await createCategory(
        identity,
        spaceId,
        'Insurance',
      );
      const deletionBudget = await putBudget(
        identity,
        spaceId,
        deletionCategoryId,
        { amount: '75.00', period: 'monthly' },
      );
      expect(deletionBudget.status).toBe(201);
      const deletionBudgetBody = responseBody<BudgetResponse>(
        await getBudget(identity, spaceId, deletionCategoryId),
      );

      const missingIfMatch = await deleteBudget(
        identity,
        spaceId,
        deletionCategoryId,
      );
      expect(missingIfMatch.status).toBe(400);
      const missingIfMatchError = errorBody(missingIfMatch).error;
      expect(missingIfMatchError.code).toBe('VALIDATION_FAILED');
      expect(missingIfMatchError.details).toEqual([
        {
          field: '/headers/if-match',
          code: 'required',
          message:
            'A Budget version is required. Reload and review your edits before saving.',
        },
      ]);

      const malformedIfMatch = await deleteBudget(
        identity,
        spaceId,
        deletionCategoryId,
        'not-a-timestamp',
      );
      expect(malformedIfMatch.status).toBe(400);
      const malformedIfMatchError = errorBody(malformedIfMatch).error;
      expect(malformedIfMatchError.code).toBe('VALIDATION_FAILED');
      expect(malformedIfMatchError.details).toEqual([
        {
          field: '/headers/if-match',
          code: 'invalid_format',
          message:
            'Budget version must be a valid timestamp. Reload and review your edits before saving.',
        },
      ]);

      const gate = await installBudgetDeleteGate(database);
      let firstDelete: Promise<{ status: number }> | undefined;
      let secondDelete: Promise<{ status: number }> | undefined;
      try {
        firstDelete = deleteBudget(
          identity,
          spaceId,
          deletionCategoryId,
          deletionBudgetBody.updatedAt,
        ).then((response) => response);
        await waitForAdvisoryWaiters(database, gate.lockKey, 1);
        // The second delete must block on the Space row while the first
        // delete is still held, so it has already observed the current version.
        secondDelete = deleteBudget(
          identity,
          spaceId,
          deletionCategoryId,
          deletionBudgetBody.updatedAt,
        ).then((response) => response);
        await waitForSpaceLockWaiter(database);
        await releaseBudgetDeleteGate(gate);
        const responses = await Promise.all([firstDelete, secondDelete]);
        expect(responses.map((response) => response.status).sort()).toEqual([
          204, 409,
        ]);
      } finally {
        await releaseBudgetDeleteGate(gate);
        await Promise.allSettled([firstDelete, secondDelete]);
        await removeBudgetDeleteGate(database, gate);
      }
    }, 15000);

    it('saves a complete Category, Budget, and Rule draft atomically with scoped revisions', async () => {
      const identity = createIdentity('category-configuration');
      await provision(identity);
      const spaceId = await personalSpaceId(identity);
      const initialRulesRevision = await categoryRulesRevision(
        identity,
        spaceId,
      );

      const createdResponse = await createCategoryConfiguration(
        identity,
        spaceId,
        {
          name: 'Trip planning',
          iconKey: 'plane',
          colorKey: 'teal',
          isActive: true,
          budget: { amount: '2400.00', currency: 'PHP', recurrence: 'yearly' },
          rules: [
            { pattern: 'AIRBNB * RESERVATION', matchType: 'exact' },
            { pattern: 'BOOKING.COM', matchType: 'contains' },
          ],
          expectedRevision: null,
          expectedRulesRevision: initialRulesRevision,
        },
      );

      expect(createdResponse.status).toBe(201);
      expect(createdResponse.headers.location).toContain('/configuration');
      const created =
        responseBody<CategoryConfigurationResponse>(createdResponse);
      expect(created).toMatchObject({
        category: {
          name: 'Trip planning',
          iconKey: 'plane',
          colorKey: 'teal',
          isActive: true,
          revision: '1',
        },
        budget: {
          amount: '2400.00',
          currency: 'PHP',
          recurrence: 'yearly',
        },
        rules: [
          { pattern: 'AIRBNB * RESERVATION', matchType: 'exact' },
          { pattern: 'BOOKING.COM', matchType: 'contains' },
        ],
        rulesRevision: '1',
      });

      const categoryId = created.category.id;
      const expenseResponse = await http()
        .post(`/api/v1/users/me/spaces/${spaceId}/expenses`)
        .set(...authorization(identity))
        .send({
          expenseDate: '2026-10-24',
          description: 'Airline ticket',
          amount: '120.00',
          categoryId,
        });
      expect(expenseResponse.status).toBe(201);
      const expenseId = readId(expenseResponse.body);
      const loaded = await getCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
      );
      expect(loaded).toEqual(created);

      const noOp = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        configurationInput(loaded),
      );
      expect(noOp.status).toBe(200);
      const noOpBody = responseBody<CategoryConfigurationResponse>(noOp);
      expect(noOpBody.category.revision).toBe(created.category.revision);
      expect(noOpBody.rulesRevision).toBe(created.rulesRevision);
      expect(noOpBody.rules.map(({ id }) => id)).toEqual(
        created.rules.map(({ id }) => id),
      );

      const otherCategory = await createCategory(identity, spaceId, 'Cafe');
      const otherConfiguration = await getCategoryConfiguration(
        identity,
        spaceId,
        otherCategory,
      );
      const otherRule = await saveCategoryConfiguration(
        identity,
        spaceId,
        otherCategory,
        {
          ...configurationInput(otherConfiguration),
          rules: [{ pattern: 'COFFEE SHOP', matchType: 'contains' }],
          expectedRulesRevision: noOpBody.rulesRevision,
        },
      );
      expect(otherRule.status).toBe(200);

      const unrelatedRuleRevision = (
        await getCategoryConfiguration(identity, spaceId, categoryId)
      ).rulesRevision;
      const renamed = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        {
          ...configurationInput(created),
          name: 'Trip plan',
        },
      );
      expect(renamed.status).toBe(200);
      const renamedBody = responseBody<CategoryConfigurationResponse>(renamed);
      expect(renamedBody.category.revision).toBe(
        String(Number(created.category.revision) + 1),
      );
      expect(renamedBody.rulesRevision).toBe(unrelatedRuleRevision);

      const staleCategory = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        {
          ...configurationInput(created),
          name: 'Stale name',
          budget: { amount: '50.00', currency: 'PHP', recurrence: 'monthly' },
        },
      );
      expect(staleCategory.status).toBe(409);
      expect(errorBody(staleCategory).error.code).toBe('STALE_EDIT');

      const latest = await getCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
      );
      const conflict = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        {
          ...configurationInput(latest),
          name: 'Must roll back',
          budget: { amount: '100.00', currency: 'PHP', recurrence: 'monthly' },
          rules: [{ pattern: ' coffee   shop ', matchType: 'contains' }],
        },
      );
      expect(conflict.status).toBe(409);
      expect(errorBody(conflict).error.code).toBe(
        'CATEGORY_RULE_PATTERN_ALREADY_EXISTS',
      );
      expect(errorBody(conflict).error.details[0]).toMatchObject({
        field: '/rules/0/pattern',
        categoryId: otherCategory,
      });
      await expect(
        getCategoryConfiguration(identity, spaceId, categoryId),
      ).resolves.toMatchObject({
        category: { name: 'Trip plan', revision: latest.category.revision },
        budget: {
          amount: '2400.00',
          recurrence: 'yearly',
        },
        rulesRevision: latest.rulesRevision,
      });

      const staleRules = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        {
          ...configurationInput(latest),
          name: 'Still unchanged',
          rules: [{ pattern: 'NEW HOTEL', matchType: 'exact' }],
          expectedRulesRevision: initialRulesRevision,
        },
      );
      expect(staleRules.status).toBe(409);
      expect(errorBody(staleRules).error.code).toBe('STALE_EDIT');

      const deactivated = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        { ...configurationInput(latest), isActive: false },
      );
      expect(deactivated.status).toBe(200);
      const inactive = responseBody<CategoryConfigurationResponse>(deactivated);
      expect(inactive.category.isActive).toBe(false);

      const duplicateInactiveName = await createCategoryConfiguration(
        identity,
        spaceId,
        {
          name: 'Trip plan',
          iconKey: 'shapes',
          colorKey: 'coral',
          isActive: true,
          budget: null,
          rules: [],
          expectedRevision: null,
          expectedRulesRevision: inactive.rulesRevision,
        },
      );
      expect(duplicateInactiveName.status).toBe(409);
      expect(errorBody(duplicateInactiveName).error.code).toBe(
        'CATEGORY_NAME_ALREADY_EXISTS',
      );

      const maintained = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        {
          ...configurationInput(inactive),
          budget: { amount: '300.00', currency: 'PHP', recurrence: 'monthly' },
          rules: [{ pattern: 'INACTIVE RULE', matchType: 'exact' }],
        },
      );
      expect(maintained.status).toBe(200);
      const maintainedBody =
        responseBody<CategoryConfigurationResponse>(maintained);
      expect(maintainedBody.category).toMatchObject({
        isActive: false,
        revision: String(Number(inactive.category.revision) + 1),
      });
      expect(maintainedBody.rulesRevision).toBe(
        String(Number(inactive.rulesRevision) + 1),
      );

      const removedBudget = await saveCategoryConfiguration(
        identity,
        spaceId,
        categoryId,
        { ...configurationInput(maintainedBody), budget: null },
      );
      expect(removedBudget.status).toBe(200);
      const removedBudgetBody =
        responseBody<CategoryConfigurationResponse>(removedBudget);
      expect(removedBudgetBody).toMatchObject({
        category: { id: categoryId, isActive: false },
        budget: null,
        rules: maintainedBody.rules,
      });
      const retainedExpense = await http()
        .get(`/api/v1/users/me/spaces/${spaceId}/expenses/${expenseId}`)
        .set(...authorization(identity));
      expect(retainedExpense.status).toBe(200);
      expect(retainedExpense.body).toMatchObject({ id: expenseId, categoryId });
    });

    async function provision(identity: TestIdentity): Promise<string> {
      const response = await http()
        .put('/api/v1/users/me')
        .set(...authorization(identity));
      expect([200, 201]).toContain(response.status);
      const userId = readId(response.body);
      createdUserIds.push(userId);
      return userId;
    }

    async function personalSpaceId(identity: TestIdentity): Promise<string> {
      const response = await http()
        .get('/api/v1/users/me/spaces')
        .set(...authorization(identity));
      expect(response.status).toBe(200);
      const personal = (response.body as SpaceView[]).find(
        (space) => space.kind === 'personal',
      );
      if (!personal) throw new Error('Expected a Personal Space');
      createdSpaceIds.push(personal.id);
      return personal.id;
    }

    async function createCategory(
      identity: TestIdentity,
      spaceId: string,
      name: string,
    ): Promise<string> {
      const rulesRevision = await categoryRulesRevision(identity, spaceId);
      const response = await http()
        .post(`/api/v1/users/me/spaces/${spaceId}/categories`)
        .set(...authorization(identity))
        .send({
          name,
          iconKey: 'shapes',
          colorKey: 'teal',
          isActive: true,
          budget: null,
          rules: [],
          expectedRevision: null,
          expectedRulesRevision: rulesRevision,
        });
      expect(response.status).toBe(201);
      return readId((response.body as CategoryConfigurationResponse).category);
    }

    async function categoryRulesRevision(
      identity: TestIdentity,
      spaceId: string,
    ): Promise<string> {
      const response = await http()
        .get(`/api/v1/users/me/spaces/${spaceId}/category-rules`)
        .set(...authorization(identity));
      expect(response.status).toBe(200);
      return (response.body as { revision: string }).revision;
    }

    async function createCategoryConfiguration(
      identity: TestIdentity,
      spaceId: string,
      input: CategoryConfigurationInput,
    ) {
      return http()
        .post(`/api/v1/users/me/spaces/${spaceId}/categories`)
        .set(...authorization(identity))
        .send(input);
    }

    async function saveCategoryConfiguration(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
      input: CategoryConfigurationInput,
    ) {
      return http()
        .put(
          `/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/configuration`,
        )
        .set(...authorization(identity))
        .send(input);
    }

    async function getCategoryConfiguration(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
    ): Promise<CategoryConfigurationResponse> {
      const response = await http()
        .get(
          `/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/configuration`,
        )
        .set(...authorization(identity));
      expect(response.status).toBe(200);
      return responseBody<CategoryConfigurationResponse>(response);
    }

    async function getCategory(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
    ): Promise<CategoryResponse> {
      const response = await http()
        .get(`/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}`)
        .set(...authorization(identity));
      expect(response.status).toBe(200);
      return responseBody<CategoryResponse>(response);
    }

    function updateCategory(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
      updatedAt: string,
      name: string,
    ) {
      return http()
        .patch(`/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}`)
        .set(...authorization(identity))
        .send({ name, updatedAt });
    }

    function putBudget(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
      body: {
        amount: string;
        period: 'monthly' | 'yearly';
        updatedAt?: string;
      },
    ) {
      return http()
        .put(
          `/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/budget`,
        )
        .set(...authorization(identity))
        .send(body);
    }

    function deleteBudget(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
      updatedAt?: string,
    ) {
      const test = http()
        .delete(
          `/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/budget`,
        )
        .set(...authorization(identity));
      if (updatedAt !== undefined) test.set('If-Match', updatedAt);
      return test;
    }

    async function getBudget(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
    ) {
      const response = await http()
        .get(
          `/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/budget`,
        )
        .set(...authorization(identity));
      expect(response.status).toBe(200);
      return response;
    }

    function http() {
      return request(application.getHttpServer() as Server);
    }

    function createIdentity(label: string): TestIdentity {
      const suffix = randomUUID().replaceAll('-', '');
      const identity = {
        token: `${label}-${suffix}`,
        clerkUserId: `http-${label}-${suffix}`,
        email: `${label}-${suffix}@example.test`,
        name: `HTTP ${label}`,
      };
      verifier.setIdentity(identity);
      profileService.setIdentity(identity);
      return identity;
    }
  },
);

interface TestIdentity {
  readonly token: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly name: string;
}

interface SpaceView {
  readonly id: string;
  readonly kind: 'personal' | 'shared';
}

interface CategoryResponse {
  readonly id: string;
  readonly updatedAt: string;
}

interface CategoryConfigurationInput {
  readonly name: string;
  readonly iconKey: string;
  readonly colorKey: string;
  readonly isActive: boolean;
  readonly budget: {
    readonly amount: string;
    readonly currency: 'PHP';
    readonly recurrence: 'monthly' | 'yearly';
  } | null;
  readonly rules: readonly {
    readonly pattern: string;
    readonly matchType: 'exact' | 'contains';
  }[];
  readonly expectedRevision: string | null;
  readonly expectedRulesRevision: string;
}

interface CategoryConfigurationResponse {
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly iconKey: string;
    readonly colorKey: string;
    readonly isActive: boolean;
    readonly revision: string;
  };
  readonly budget: {
    readonly amount: string;
    readonly currency: 'PHP';
    readonly recurrence: 'monthly' | 'yearly';
  } | null;
  readonly rules: readonly {
    readonly id: string;
    readonly pattern: string;
    readonly matchType: 'exact' | 'contains';
  }[];
  readonly rulesRevision: string;
}

function configurationInput(
  configuration: CategoryConfigurationResponse,
): CategoryConfigurationInput {
  return {
    name: configuration.category.name,
    iconKey: configuration.category.iconKey,
    colorKey: configuration.category.colorKey,
    isActive: configuration.category.isActive,
    budget: configuration.budget,
    rules: configuration.rules.map(({ pattern, matchType }) => ({
      pattern,
      matchType,
    })),
    expectedRevision: configuration.category.revision,
    expectedRulesRevision: configuration.rulesRevision,
  };
}

interface BudgetResponse {
  readonly id: string;
  readonly updatedAt: string;
}

interface BudgetDeleteGate {
  readonly functionName: string;
  readonly lockKey: number;
  readonly queryRunner: QueryRunner;
  readonly triggerName: string;
  released: boolean;
}

class HttpTokenVerifier implements ClerkTokenVerifier {
  private readonly sessions = new Map<string, ClerkSession>();

  setIdentity(identity: TestIdentity): void {
    this.sessions.set(identity.token, {
      userId: identity.clerkUserId,
      sessionId: `${identity.token}-session`,
      claims: { sub: identity.clerkUserId },
    });
  }

  verify(token: string): Promise<ClerkSession> {
    const session = this.sessions.get(token);
    return session
      ? Promise.resolve(session)
      : Promise.reject(new Error('Invalid test token'));
  }

  clear(): void {
    this.sessions.clear();
  }
}

class HttpProfileService implements ClerkProfileService {
  private readonly profiles = new Map<string, ClerkUserProfile>();

  setIdentity(identity: TestIdentity): void {
    this.profiles.set(identity.clerkUserId, {
      fullName: identity.name,
      primaryVerifiedEmail: identity.email,
      verifiedEmails: [identity.email],
    });
  }

  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    return Promise.resolve(this.profiles.get(clerkUserId) ?? null);
  }

  clear(): void {
    this.profiles.clear();
  }
}

function authorization(identity: TestIdentity): [string, string] {
  return ['Authorization', `Bearer ${identity.token}`];
}

function responseBody<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}

function errorBody(response: { readonly body: unknown }): ErrorEnvelope {
  return response.body as ErrorEnvelope;
}

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly details: readonly ErrorDetail[];
  };
}

interface ErrorDetail {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

function readId(value: unknown): string {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { id?: unknown }).id !== 'string'
  ) {
    throw new Error('Expected a response with a string id');
  }

  return (value as { id: string }).id;
}

async function installBudgetDeleteGate(
  database: DataSource,
): Promise<BudgetDeleteGate> {
  const suffix = randomUUID().replaceAll('-', '');
  const gate: BudgetDeleteGate = {
    functionName: `space_category_budget_delete_gate_fn_${suffix}`,
    lockKey: Number.parseInt(suffix.slice(0, 7), 16) + 1,
    queryRunner: database.createQueryRunner(),
    triggerName: `space_category_budget_delete_gate_${suffix}`,
    released: false,
  };

  await gate.queryRunner.connect();
  await gate.queryRunner.query('SELECT pg_advisory_lock($1::integer)', [
    gate.lockKey,
  ]);
  await database.query(`
    CREATE FUNCTION "${gate.functionName}"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      PERFORM pg_advisory_xact_lock(${gate.lockKey});
      RETURN OLD;
    END;
    $function$;
  `);
  await database.query(`
    CREATE TRIGGER "${gate.triggerName}"
    BEFORE DELETE ON "budgets"
    FOR EACH ROW
    EXECUTE FUNCTION "${gate.functionName}"();
  `);

  return gate;
}

async function waitForAdvisoryWaiters(
  database: DataSource,
  lockKey: number,
  expectedWaiters: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows: { count: number | string }[] = await database.query(
      `
        SELECT COUNT(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = 0
          AND objid = $1::oid
          AND objsubid = 1
          AND granted = false
      `,
      [lockKey],
    );
    if (Number(rows[0]?.count) >= expectedWaiters) return;

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Advisory lock ${lockKey} did not receive ${expectedWaiters} waiters`,
  );
}

async function waitForSpaceLockWaiter(database: DataSource): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows: { count: number | string }[] = await database.query(
      `
        SELECT COUNT(*)::int AS count
        FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND wait_event = 'transactionid'
          AND query ILIKE '%spaces%'
      `,
    );
    if (Number(rows[0]?.count) >= 1) return;

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    'The second Budget delete did not wait on the Space lock before the gate opened',
  );
}

async function releaseBudgetDeleteGate(gate: BudgetDeleteGate): Promise<void> {
  if (gate.released) return;

  await gate.queryRunner.query('SELECT pg_advisory_unlock($1::integer)', [
    gate.lockKey,
  ]);
  gate.released = true;
}

async function removeBudgetDeleteGate(
  database: DataSource,
  gate: BudgetDeleteGate,
): Promise<void> {
  if (!gate.queryRunner.isReleased) {
    await gate.queryRunner.release();
  }
  await database.query(
    `DROP TRIGGER IF EXISTS "${gate.triggerName}" ON "budgets"`,
  );
  await database.query(`DROP FUNCTION IF EXISTS "${gate.functionName}"()`);
}

function testConfig(url: string | undefined): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: url,
    clerkJwtKey: undefined,
    clerkSecretKey: undefined,
  };
}
