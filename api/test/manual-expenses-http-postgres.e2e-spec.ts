import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource, In } from 'typeorm';

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

const databaseUrl = process.env.TEST_SPACES_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Manual Expenses over authenticated HTTP with PostgreSQL',
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
      if (!database?.isInitialized || createdSpaceIds.length === 0) {
        verifier.clear();
        profileService.clear();
        createdUserIds.splice(0);
        createdSpaceIds.splice(0);
        return;
      }

      const categories = await database
        .getRepository(CategoryEntity)
        .findBy({ spaceId: In(createdSpaceIds) });
      if (categories.length > 0) {
        await database.getRepository(BudgetEntity).delete({
          categoryId: In(categories.map((category) => category.id)),
        });
      }
      await database.getRepository(ExpenseActivityEntity).delete({
        spaceId: In(createdSpaceIds),
      });
      await database.getRepository(ExpenseEntity).delete({
        spaceId: In(createdSpaceIds),
      });
      if (categories.length > 0) {
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

    it('creates a manual Expense with server Added By and reloads it', async () => {
      const identity = createIdentity('manual-expense');
      const userId = await provision(identity);
      const spaceId = await personalSpaceId(identity);
      const categoryId = (
        await createCategory(identity, spaceId, 'Market stall')
      ).id;
      const inactive = await createCategory(identity, spaceId, 'Retired');
      const inactiveCategory = await getCategory(
        identity,
        spaceId,
        inactive.id,
      );
      const deactivated = await http()
        .patch(`/api/v1/users/me/spaces/${spaceId}/categories/${inactive.id}`)
        .set(...authorization(identity))
        .send({ isActive: false, updatedAt: inactiveCategory.updatedAt });
      expect(deactivated.status).toBe(200);

      const outsider = createIdentity('manual-expense-outsider');
      await provision(outsider);
      const outsiderSpaceId = await personalSpaceId(outsider);
      const outsiderCategoryId = (
        await createCategory(outsider, outsiderSpaceId, 'Private')
      ).id;

      const rejectedActor = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: 'Coffee',
        amount: '4.50',
        categoryId,
        addedByUserId: outsider.clerkUserId,
      });
      expect(rejectedActor.status).toBe(400);

      const future = await createExpense(identity, spaceId, {
        expenseDate: '2099-01-01',
        description: 'Coffee',
        amount: '4.50',
        categoryId,
      });
      expect(future.status).toBe(400);
      expect(errorBody(future).error.details).toEqual([
        expect.objectContaining({ field: '/expenseDate', code: 'future_date' }),
      ]);

      const blank = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: '   ',
        amount: '4.50',
        categoryId,
      });
      expect(blank.status).toBe(400);

      const zero = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: 'Coffee',
        amount: '0.00',
        categoryId,
      });
      expect(zero.status).toBe(400);

      const inactiveExpense = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: 'Coffee',
        amount: '4.50',
        categoryId: inactive.id,
      });
      expect(inactiveExpense.status).toBe(409);
      expect(errorBody(inactiveExpense).error.code).toBe('CATEGORY_INACTIVE');

      const otherSpace = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: 'Coffee',
        amount: '4.50',
        categoryId: outsiderCategoryId,
      });
      expect(otherSpace.status).toBe(404);
      expect(errorBody(otherSpace).error.code).toBe('CATEGORY_NOT_FOUND');

      const created = await createExpense(identity, spaceId, {
        expenseDate: '2026-03-15',
        description: '  Market run  ',
        amount: '12.50',
        categoryId,
      });
      expect(created.status).toBe(201);
      expect(created.headers.location).toBe(
        `/api/v1/users/me/spaces/${spaceId}/expenses/${readId(created.body)}`,
      );
      const createdBody = expenseBody(created);
      expect(createdBody).toMatchObject({
        expenseDate: '2026-03-15',
        description: 'Market run',
        amount: '12.50',
        categoryId,
        source: 'manual',
        addedByUserId: userId,
      });

      const reloaded = await http()
        .get(`/api/v1/users/me/spaces/${spaceId}/expenses/${createdBody.id}`)
        .set(...authorization(identity));
      expect(reloaded.status).toBe(200);
      expect(expenseBody(reloaded)).toMatchObject({
        id: createdBody.id,
        description: 'Market run',
        amount: '12.50',
        addedByUserId: userId,
      });
      const stored = await database.getRepository(ExpenseEntity).findOneBy({
        id: createdBody.id,
      });
      expect(stored?.addedByUserId).toBe(userId);
    });

    it('returns the same March 15 to May 10 totals on every page and rejects a changed cursor', async () => {
      const identity = createIdentity('expense-pages');
      const userId = await provision(identity);
      const spaceId = await personalSpaceId(identity);
      const categoryA = (await createCategory(identity, spaceId, 'Category A'))
        .id;
      const categoryB = (await createCategory(identity, spaceId, 'Category B'))
        .id;
      const other = createIdentity('expense-pages-other');
      const otherUserId = await provision(other);
      const otherSpaceId = await personalSpaceId(other);
      await database.getRepository(SpaceMembershipEntity).save({
        spaceId: otherSpaceId,
        userId,
        accessLevel: 'read',
      });

      const march = await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-03-15',
        'Market',
        '10.00',
      );
      const cafe = await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-04-01',
        'Cafe',
        '20.00',
      );
      const cafeLate = await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-04-01',
        'cafe late',
        '5.25',
      );
      const may = await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-05-10',
        'Market run',
        '100.00',
      );
      await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-03-14',
        'Early',
        '1.00',
      );
      await saveExpense(
        identity,
        spaceId,
        categoryA,
        '2026-05-11',
        'Late',
        '7.00',
      );
      await saveExpense(
        identity,
        spaceId,
        categoryB,
        '2026-04-01',
        'Market',
        '50.00',
      );

      const selection = {
        fromDate: '2026-03-15',
        toDate: '2026-05-10',
        categoryId: categoryA,
        sort: 'newest',
        pageSize: '1',
      };
      const pages = await collectPages(identity, spaceId, selection);
      expect(pages.map((page) => page.totalCount)).toEqual([
        '4',
        '4',
        '4',
        '4',
      ]);
      expect(pages.map((page) => page.totalAmount)).toEqual([
        '135.25',
        '135.25',
        '135.25',
        '135.25',
      ]);
      expect(
        pages.flatMap((page) => page.expenses.map((expense) => expense.id)),
      ).toEqual([may.id, cafeLate.id, cafe.id, march.id]);

      const oldest = await collectPages(identity, spaceId, {
        ...selection,
        sort: 'oldest',
      });
      expect(
        oldest.flatMap((page) => page.expenses.map((expense) => expense.id)),
      ).toEqual([march.id, cafe.id, cafeLate.id, may.id]);
      expect(oldest.every((page) => page.totalAmount === '135.25')).toBe(true);

      const widerPage = await listExpenses(identity, spaceId, {
        ...selection,
        pageSize: '2',
        cursor: pages[0]?.nextCursor ?? '',
      });
      expect(widerPage.status).toBe(200);
      expect(pageBody(widerPage).totalCount).toBe('4');
      expect(pageBody(widerPage).totalAmount).toBe('135.25');

      const searched = await listExpenses(identity, spaceId, {
        ...selection,
        description: 'market',
        pageSize: '20',
      });
      expect(searched.status).toBe(200);
      expect(pageBody(searched)).toMatchObject({
        totalCount: '2',
        totalAmount: '110.00',
      });
      expect(pageBody(searched).expenses.map((expense) => expense.id)).toEqual([
        may.id,
        march.id,
      ]);

      const cursor = pages[0]?.nextCursor;
      expect(cursor).toEqual(expect.any(String));
      const changedCategory = await listExpenses(identity, spaceId, {
        ...selection,
        categoryId: categoryB,
        cursor: cursor ?? '',
      });
      expect(changedCategory.status).toBe(400);
      expect(errorBody(changedCategory).error.details).toEqual([
        {
          field: '/cursor',
          code: 'incompatible',
          message: 'Cursor does not match the requested expense filters',
        },
      ]);
      const changedSort = await listExpenses(identity, spaceId, {
        ...selection,
        sort: 'oldest',
        cursor: cursor ?? '',
      });
      expect(changedSort.status).toBe(400);
      const changedSpace = await listExpenses(identity, otherSpaceId, {
        ...selection,
        categoryId: categoryA,
        cursor: cursor ?? '',
      });
      expect(changedSpace.status).toBe(400);
      expect(otherUserId).toEqual(expect.any(String));
    });

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
    ): Promise<CategoryResponse> {
      const response = await http()
        .post(`/api/v1/users/me/spaces/${spaceId}/categories`)
        .set(...authorization(identity))
        .send({ name });
      expect(response.status).toBe(201);
      return response.body as CategoryResponse;
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
      return response.body as CategoryResponse;
    }

    function createExpense(
      identity: TestIdentity,
      spaceId: string,
      body: Record<string, string>,
    ) {
      return http()
        .post(`/api/v1/users/me/spaces/${spaceId}/expenses`)
        .set(...authorization(identity))
        .send(body);
    }

    async function saveExpense(
      identity: TestIdentity,
      spaceId: string,
      categoryId: string,
      expenseDate: string,
      description: string,
      amount: string,
    ): Promise<ExpenseResponse> {
      const response = await createExpense(identity, spaceId, {
        expenseDate,
        description,
        amount,
        categoryId,
      });
      expect(response.status).toBe(201);
      return expenseBody(response);
    }

    function listExpenses(
      identity: TestIdentity,
      spaceId: string,
      query: Record<string, string>,
    ) {
      return http()
        .get(`/api/v1/users/me/spaces/${spaceId}/expenses`)
        .query(query)
        .set(...authorization(identity));
    }

    async function collectPages(
      identity: TestIdentity,
      spaceId: string,
      query: Record<string, string>,
    ): Promise<ExpensePage[]> {
      const pages: ExpensePage[] = [];
      let cursor: string | null = null;
      do {
        const response = await listExpenses(identity, spaceId, {
          ...query,
          ...(cursor === null ? {} : { cursor }),
        });
        expect(response.status).toBe(200);
        const page = pageBody(response);
        pages.push(page);
        cursor = page.nextCursor;
        if (pages.length > 6) {
          throw new Error('Expense pages did not end');
        }
      } while (cursor !== null);
      return pages;
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

interface ExpenseResponse {
  readonly id: string;
  readonly addedByUserId?: string;
}

interface ExpensePage {
  readonly expenses: readonly ExpenseResponse[];
  readonly nextCursor: string | null;
  readonly totalCount: string;
  readonly totalAmount: string;
}

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly details: readonly {
      field: string;
      code: string;
      message: string;
    }[];
  };
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

function expenseBody(response: { readonly body: unknown }): ExpenseResponse {
  return response.body as ExpenseResponse;
}

function pageBody(response: { readonly body: unknown }): ExpensePage {
  return response.body as ExpensePage;
}

function errorBody(response: { readonly body: unknown }): ErrorEnvelope {
  return response.body as ErrorEnvelope;
}

function testConfig(url: string | undefined): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: url,
    clerkJwtKey: undefined,
    clerkSecretKey: undefined,
    clerkAuthorizedParties: [],
  };
}
