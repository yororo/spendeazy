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
      configureApp(application, testConfig(databaseUrl));
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
        'Utilities',
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
      const deleteResponses = Promise.all([
        deleteBudget(
          identity,
          spaceId,
          deletionCategoryId,
          deletionBudgetBody.updatedAt,
        ),
        deleteBudget(
          identity,
          spaceId,
          deletionCategoryId,
          deletionBudgetBody.updatedAt,
        ),
      ]);
      try {
        await waitForAdvisoryWaiters(database, gate.lockKey, 2);
        await releaseBudgetDeleteGate(gate);
        const responses = await deleteResponses;
        expect(responses.map((response) => response.status).sort()).toEqual([
          204, 409,
        ]);
      } finally {
        await releaseBudgetDeleteGate(gate);
        await deleteResponses.catch(() => undefined);
        await removeBudgetDeleteGate(database, gate);
      }
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
      const response = await http()
        .post(`/api/v1/users/me/spaces/${spaceId}/categories`)
        .set(...authorization(identity))
        .send({ name });
      expect(response.status).toBe(201);
      return readId(response.body);
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
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
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
    corsOrigins: ['http://127.0.0.1:4173'],
    clerkJwtKey: undefined,
    clerkSecretKey: undefined,
    clerkAuthorizedParties: [],
  };
}
