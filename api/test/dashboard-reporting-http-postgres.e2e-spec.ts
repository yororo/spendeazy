import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { MANILA_CLOCK } from '../src/http/manila-clock';
import { createAppModule } from '../src/app.module';
import type { DashboardReportResponse } from '../src/reporting/application/dashboard-report.service';
import {
  DASHBOARD_REPORT_STORE,
  type DashboardReportStore,
} from '../src/reporting/application/dashboard-report-store';
import { configureApp } from '../src/bootstrap';
import type { AppConfig } from '../src/config/app-config';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { ExpenseEntity } from '../src/database/entities/expense.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { UserEntity } from '../src/database/entities/user.entity';

const databaseUrl = process.env.TEST_DASHBOARD_REPORTING_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const FIXED_NOW = new Date('2026-07-03T00:30:00.000+08:00');

describeDatabase(
  'Dashboard reporting over authenticated HTTP with PostgreSQL',
  () => {
    let application: INestApplication;
    let database: DataSource;
    let verifier: HttpTokenVerifier;
    let profiles: HttpProfileService;
    const createdUserIds: string[] = [];
    const createdSpaceIds: string[] = [];

    beforeAll(async () => {
      verifier = new HttpTokenVerifier();
      profiles = new HttpProfileService();
      const module = await Test.createTestingModule({
        imports: [
          createAppModule(testConfig(databaseUrl), {
            authentication: {
              tokenVerifier: {
                provide: CLERK_TOKEN_VERIFIER,
                useValue: verifier,
              },
              profileService: {
                provide: CLERK_PROFILE_SERVICE,
                useValue: profiles,
              },
            },
          }),
        ],
      })
        .overrideProvider(MANILA_CLOCK)
        .useValue(() => new Date(FIXED_NOW))
        .compile();

      application = module.createNestApplication({ bodyParser: false });
      configureApp(application);
      await application.init();
      database = application.get(DataSource);
      await database.runMigrations();
    });

    afterEach(async () => {
      if (!database?.isInitialized || createdSpaceIds.length === 0) {
        verifier.clear();
        profiles.clear();
        createdUserIds.splice(0);
        createdSpaceIds.splice(0);
        return;
      }

      await database
        .getRepository(SpaceEntity)
        .update({ id: In(createdSpaceIds) }, { status: 'active' });
      const categories = await database
        .getRepository(CategoryEntity)
        .findBy({ spaceId: In(createdSpaceIds) });
      if (categories.length > 0) {
        await database.getRepository(BudgetEntity).delete({
          categoryId: In(categories.map((category) => category.id)),
        });
      }
      await database.getRepository(ExpenseEntity).delete({
        spaceId: In(createdSpaceIds),
      });
      await database.getRepository(StatementImportEntity).delete({
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
      profiles.clear();
    });

    afterAll(async () => {
      if (application) await application.close();
    });

    it('returns exact six-month planning, all Expense actuals, current checks and confirmation-time imports', async () => {
      const fixture = await createFixture('six-month-report');
      const home = await createCategory(
        fixture,
        'Report Home',
        true,
        'emerald',
      );
      const groceries = await createCategory(
        fixture,
        'Report Groceries',
        true,
        'gold',
      );
      const transport = await createCategory(
        fixture,
        'Report Transport',
        true,
        'azure',
      );
      const travel = await createCategory(
        fixture,
        'Report Travel',
        true,
        'violet',
      );
      const inactive = await createCategory(
        fixture,
        'Report Inactive',
        false,
        'slate',
      );
      const unbudgeted = await createCategory(
        fixture,
        'Report Unbudgeted',
        true,
        'teal',
      );
      await createBudget(home.id, 'monthly', '1200.00');
      await createBudget(groceries.id, 'monthly', '400.00');
      await createBudget(transport.id, 'monthly', '200.00');
      await createBudget(travel.id, 'yearly', '2400.00');
      await createBudget(inactive.id, 'monthly', '1000.00');

      await saveExpense(fixture, home.id, '2026-01-05', '960.00');
      await saveExpense(fixture, home.id, '2026-02-05', '1200.00');
      await saveExpense(fixture, home.id, '2026-03-05', '1200.01');
      await saveExpense(fixture, home.id, '2026-04-05', '1000.00');
      await saveExpense(fixture, home.id, '2026-05-05', '1000.00');
      await saveExpense(fixture, home.id, '2026-06-05', '1039.99');
      await saveExpense(fixture, groceries.id, '2026-02-11', '2000.00');
      await saveExpense(fixture, transport.id, '2026-03-12', '1900.00');
      await saveExpense(fixture, travel.id, '2026-06-15', '2100.00');
      await saveExpense(fixture, inactive.id, '2026-04-08', '40.00');
      await saveExpense(fixture, unbudgeted.id, '2026-05-09', '35.00');
      await saveExpense(fixture, home.id, '2026-01-06', '999999.00', {
        deletedAt: new Date('2026-07-02T00:00:00.000Z'),
      });
      const juneImport = await saveStatementImport(
        fixture,
        '2026-01-15',
        '2026-05-31T16:00:00.000Z',
      );
      await saveStatementImport(
        fixture,
        '2026-06-30',
        '2026-06-30T16:00:00.000Z',
      );
      await saveExpense(fixture, groceries.id, '2026-06-20', '25.00', {
        statementImportId: juneImport.id,
        sourceRowId: 'imported-row-1',
      });

      const reportData = await application
        .get<DashboardReportStore>(DASHBOARD_REPORT_STORE)
        .readDashboardReport({
          spaceId: fixture.spaceId,
          expenseFromDate: '2026-01-01',
          expenseToDate: '2026-07-03',
          importFromDate: '2025-12-31T16:00:00.000Z',
          importToDateExclusive: '2026-07-01T16:00:00.000Z',
        });
      expect(reportData.expenses).toContainEqual({
        categoryId: home.id,
        expenseDate: '2026-01-05',
        amount: '960.00',
      });

      const response = await http()
        .get(`/api/v1/users/me/spaces/${fixture.spaceId}/reporting/dashboard`)
        .query({ view: 'monthly', endMonth: '2026-06' })
        .set(...authorization(fixture.identity));

      expect(response.status).toBe(200);
      const body = response.body as DashboardReportResponse;
      expect(body).toMatchObject({
        range: {
          view: 'monthly',
          fromDate: '2026-01-01',
          toDate: '2026-06-30',
          today: '2026-07-03',
          timezone: 'Asia/Manila',
          currency: 'PHP',
          configurationBasis: 'current',
          inProgress: false,
        },
        summary: {
          actualAmount: '12500.00',
          expenseCount: '12',
          planned: {
            exact: { numerator: '12000', denominator: '1' },
            amount: '12000.00',
            months: 6,
            monthlyEquivalent: {
              exact: { numerator: '2000', denominator: '1' },
              amount: '2000.00',
            },
            annualEquivalent: {
              exact: { numerator: '24000', denominator: '1' },
              amount: '24000.00',
            },
          },
          comparison: {
            direction: 'above_plan',
            difference: {
              exact: { numerator: '500', denominator: '1' },
              amount: '500.00',
            },
            percentage: {
              exact: { numerator: '25', denominator: '6' },
              amount: '4.2',
            },
          },
          highestCategory: {
            categoryId: home.id,
            name: 'Report Home',
            amount: '6400.00',
          },
          statementImports: {
            count: '1',
            latestConfirmedAt: '2026-05-31T16:00:00.000Z',
            filter: { fromDate: '2026-01-01', toDate: '2026-06-30' },
          },
        },
      });
      expect(body.monthlyExpenses).toHaveLength(6);
      expect(body.monthlyExpenses[0]).toMatchObject({
        month: '2026-01',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        actualAmount: '960.00',
      });
      expect(
        body.budgetChecks.monthly.find((check) => check.categoryId === home.id),
      ).toMatchObject({ overBudgetMonths: 1, eligibleMonths: 6 });
      expect(
        body.budgetChecks.yearly.find(
          (check) => check.categoryId === travel.id && check.year === '2026',
        ),
      ).toMatchObject({
        actualAmount: '2100.00',
        limitAmount: '2400.00',
        status: 'nearing',
        usageFromDate: '2026-01-01',
        usageToDate: '2026-07-03',
      });
      expect(
        body.categoryExpenses
          .find((category) => category.categoryId === home.id)
          .months.slice(0, 3)
          .map((month) => month.budgetStatus),
      ).toEqual(['nearing', 'at_limit', 'over']);

      const filteredChart = await http()
        .get(`/api/v1/users/me/spaces/${fixture.spaceId}/reporting/dashboard`)
        .query({
          view: 'monthly',
          endMonth: '2026-06',
          chartCategoryId: travel.id,
        })
        .set(...authorization(fixture.identity));
      expect(filteredChart.status).toBe(200);
      const filteredBody = filteredChart.body as DashboardReportResponse;
      expect(filteredBody.summary.actualAmount).toBe('12500.00');
      expect(filteredBody.summary.planned.amount).toBe('12000.00');
      expect(filteredBody.monthlyExpenses).toHaveLength(6);
      expect(
        filteredBody.categoryExpenses.map((item) => item.categoryId),
      ).toEqual([travel.id]);
      expect(filteredBody.budgetChecks.monthly).toEqual(
        body.budgetChecks.monthly,
      );

      const yearly = await http()
        .get(`/api/v1/users/me/spaces/${fixture.spaceId}/reporting/dashboard`)
        .query({ view: 'yearly', year: '2026' })
        .set(...authorization(fixture.identity));
      expect(yearly.status).toBe(200);
      const yearlyBody = yearly.body as DashboardReportResponse;
      expect(yearlyBody.range).toMatchObject({
        fromDate: '2026-01-01',
        toDate: '2026-07-03',
        inProgress: true,
      });
      expect(yearlyBody.summary.planned).toMatchObject({
        exact: { numerator: '14000', denominator: '1' },
        amount: '14000.00',
        months: 7,
        monthlyEquivalent: {
          exact: { numerator: '2000', denominator: '1' },
          amount: '2000.00',
        },
      });
      expect(yearlyBody.budgetChecks.yearly).toContainEqual(
        expect.objectContaining({
          categoryId: travel.id,
          year: '2026',
          actualAmount: '2100.00',
          limitAmount: '2400.00',
          usageToDate: '2026-07-03',
        }),
      );
    });

    async function createFixture(label: string) {
      const identity = createIdentity(label);
      const userId = await provision(identity);
      const spaceResponse = await http()
        .get('/api/v1/users/me/spaces')
        .set(...authorization(identity));
      expect(spaceResponse.status).toBe(200);
      const spaceId = (
        spaceResponse.body as { id: string; kind: string }[]
      ).find((space) => space.kind === 'personal')?.id;
      if (!spaceId) throw new Error('Expected a Personal Space');
      createdSpaceIds.push(spaceId);
      return { identity, userId, spaceId };
    }

    async function createCategory(
      fixture: Awaited<ReturnType<typeof createFixture>>,
      name: string,
      isActive: boolean,
      color: string,
    ): Promise<CategoryEntity> {
      return database.getRepository(CategoryEntity).save({
        spaceId: fixture.spaceId,
        name,
        description: null,
        iconKey: 'shapes',
        color,
        isActive,
        revision: '1',
      });
    }

    async function createBudget(
      categoryId: string,
      period: 'monthly' | 'yearly',
      amount: string,
    ): Promise<void> {
      await database.getRepository(BudgetEntity).save({
        categoryId,
        period,
        amount,
      });
    }

    async function saveExpense(
      fixture: Awaited<ReturnType<typeof createFixture>>,
      categoryId: string,
      expenseDate: string,
      amount: string,
      options: {
        deletedAt?: Date;
        statementImportId?: string;
        sourceRowId?: string;
      } = {},
    ): Promise<ExpenseEntity> {
      return database.getRepository(ExpenseEntity).save({
        spaceId: fixture.spaceId,
        addedByUserId: fixture.userId,
        categoryId,
        statementImportId: options.statementImportId ?? null,
        sourceRowId: options.sourceRowId ?? null,
        expenseDate,
        description: 'Dashboard report fixture',
        amount,
        importFingerprint: null,
        referenceHash: null,
        revision: options.deletedAt ? '2' : '1',
        deletedAt: options.deletedAt ?? null,
        deletedByUserId: options.deletedAt ? fixture.userId : null,
        deletedFromRevision: options.deletedAt ? '1' : null,
      });
    }

    async function saveStatementImport(
      fixture: Awaited<ReturnType<typeof createFixture>>,
      statementDate: string,
      importedAt: string,
    ): Promise<StatementImportEntity> {
      return database.getRepository(StatementImportEntity).save({
        spaceId: fixture.spaceId,
        importedByUserId: fixture.userId,
        fileName: `report-${randomUUID()}.pdf`,
        fileHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        statementDate,
        provider: 'test-provider',
        accountFormat: null,
        statementType: 'credit_card',
        historyFromDate: null,
        historyToDate: null,
        totalDebit: '0.00',
        importedAt: new Date(importedAt),
      });
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
      profiles.setIdentity(identity);
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
  },
);

interface TestIdentity {
  readonly token: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly name: string;
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

function testConfig(url: string | undefined): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: url,
    clerkJwtKey: undefined,
    clerkSecretKey: undefined,
  };
}
