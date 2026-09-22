import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { StaleEditError } from '../src/errors/application-error';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { BudgetsService } from '../src/categories/application/budgets.service';
import type {
  BudgetRecord,
  UpdateBudget,
} from '../src/categories/application/budget-store';
import { CategoriesService } from '../src/categories/application/categories.service';
import type {
  CategoryRecord,
  UpdateCategory,
} from '../src/categories/application/category-store';
import { SpaceBudgetsController } from '../src/categories/presentation/space-budgets.controller';
import { SpaceCategoriesController } from '../src/categories/presentation/space-categories.controller';
import { USER_STORE } from '../src/users/application/user-store';

const CATEGORY_VERSION = '2026-09-20T00:00:00.000Z';
const CATEGORY_NEXT_VERSION = '2026-09-20T00:01:00.000Z';
const BUDGET_VERSION = '2026-09-20T00:00:00.000Z';
const BUDGET_NEXT_VERSION = '2026-09-20T00:01:00.000Z';
const BUDGET_CREATED_VERSION = '2026-09-20T00:02:00.000Z';

describe('Authenticated Space Category and Budget concurrency', () => {
  let application: INestApplication;
  let verifier: FakeClerkTokenVerifier;
  let currentCategory: CategoryRecord;
  let categoryVersion: string;
  let currentBudget: BudgetRecord | null;
  let budgetVersion: string;

  const categoriesService = {
    updateCategoryInSpace: jest.fn(
      (
        _spaceId: string,
        _categoryId: string,
        input: UpdateCategory,
      ): Promise<CategoryRecord> => {
        if (input.expectedUpdatedAt !== categoryVersion) {
          return Promise.reject(new StaleEditError());
        }

        categoryVersion = CATEGORY_NEXT_VERSION;
        currentCategory = {
          ...currentCategory,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.color === undefined ? {} : { color: input.color }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          updatedAt: new Date(categoryVersion),
        };
        return Promise.resolve(currentCategory);
      },
    ),
  };

  const budgetsService = {
    putBudgetInSpace: jest.fn(
      (
        _spaceId: string,
        categoryId: string,
        input: UpdateBudget,
      ): Promise<{ budget: BudgetRecord; created: boolean }> => {
        if (currentBudget !== null) {
          if (input.expectedUpdatedAt !== budgetVersion) {
            return Promise.reject(new StaleEditError());
          }

          budgetVersion = BUDGET_NEXT_VERSION;
          const replacedBudget = budgetRecord(
            categoryId,
            input.amount,
            input.period,
            budgetVersion,
          );
          currentBudget = replacedBudget;
          return Promise.resolve({ budget: replacedBudget, created: false });
        }

        if (input.expectedUpdatedAt !== undefined) {
          return Promise.reject(new StaleEditError());
        }

        budgetVersion = BUDGET_CREATED_VERSION;
        const createdBudget = budgetRecord(
          categoryId,
          input.amount,
          input.period,
          budgetVersion,
        );
        currentBudget = createdBudget;
        return Promise.resolve({ budget: createdBudget, created: true });
      },
    ),
    deleteBudgetInSpace: jest.fn().mockResolvedValue(undefined),
  };

  const spaceAccessService = {
    requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
  };

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    const module = await Test.createTestingModule({
      controllers: [SpaceCategoriesController, SpaceBudgetsController],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        {
          provide: USER_STORE,
          useValue: {
            findByClerkUserId: jest.fn().mockResolvedValue({ id: '42' }),
          },
        },
        { provide: SpaceAccessService, useValue: spaceAccessService },
        { provide: CategoriesService, useValue: categoriesService },
        { provide: BudgetsService, useValue: budgetsService },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    application = module.createNestApplication();
    configureApp(application, testConfig);
    await application.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentCategory = categoryRecord(CATEGORY_VERSION);
    categoryVersion = CATEGORY_VERSION;
    currentBudget = budgetRecord('42', '125.00', 'monthly', BUDGET_VERSION);
    budgetVersion = BUDGET_VERSION;
    spaceAccessService.requireWriteAccess.mockResolvedValue({ id: '10' });
    spaceAccessService.requireReadAccess.mockResolvedValue({ id: '10' });
  });

  afterAll(async () => {
    await application.close();
  });

  it('requires the last-read Category version and rejects a concurrent stale write', async () => {
    const server = application.getHttpServer() as Server;
    const missingVersionResponse = await request(server)
      .patch('/api/v1/users/me/spaces/10/categories/42')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ name: 'Dining' });

    expect(missingVersionResponse.status).toBe(400);
    expect(missingVersionResponse.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request contains invalid fields.',
        details: [
          {
            field: '/updatedAt',
            code: 'required',
            message:
              'A Category version is required. Reload and review your edits before saving.',
          },
        ],
      },
    });

    const malformedVersionResponse = await request(server)
      .patch('/api/v1/users/me/spaces/10/categories/42')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ name: 'Dining', updatedAt: 42 });

    expect(malformedVersionResponse.status).toBe(400);
    const malformedVersionError = errorBody(malformedVersionResponse).error;
    expect(malformedVersionError.code).toBe('VALIDATION_FAILED');
    expect(
      malformedVersionError.details.some(
        (detail) =>
          detail.field === '/updatedAt' &&
          detail.message.includes('Reload and review'),
      ),
    ).toBe(true);

    const responses = await Promise.all([
      updateCategoryRequest(server, 'Dining'),
      updateCategoryRequest(server, 'Restaurants'),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(categoriesService.updateCategoryInSpace).toHaveBeenCalledTimes(2);
    expect(responses.find((response) => response.status === 409)?.body).toEqual(
      staleEditBody(),
    );
  });

  it('makes concurrent Budget replacement and creation deterministic', async () => {
    const server = application.getHttpServer() as Server;
    const replacements = await Promise.all([
      putBudgetRequest(server, {
        amount: '200.00',
        period: 'monthly',
        updatedAt: BUDGET_VERSION,
      }),
      putBudgetRequest(server, {
        amount: '225.00',
        period: 'monthly',
        updatedAt: BUDGET_VERSION,
      }),
    ]);

    expect(replacements.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);

    const malformedBudgetVersionResponse = await putBudgetRequest(server, {
      amount: '250.00',
      period: 'monthly',
      updatedAt: 42 as unknown as string,
    });
    expect(malformedBudgetVersionResponse.status).toBe(400);
    const malformedBudgetVersionError = errorBody(
      malformedBudgetVersionResponse,
    ).error;
    expect(malformedBudgetVersionError.code).toBe('VALIDATION_FAILED');
    expect(
      malformedBudgetVersionError.details.some(
        (detail) =>
          detail.field === '/updatedAt' &&
          detail.message.includes('Reload and review'),
      ),
    ).toBe(true);

    currentBudget = null;
    const creations = await Promise.all([
      putBudgetRequest(server, { amount: '300.00', period: 'monthly' }),
      putBudgetRequest(server, { amount: '325.00', period: 'monthly' }),
    ]);

    expect(creations.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    const missingIfMatchResponse = await request(server)
      .delete('/api/v1/users/me/spaces/10/categories/42/budget')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(missingIfMatchResponse.status).toBe(400);
    expect(budgetsService.deleteBudgetInSpace).not.toHaveBeenCalled();

    const malformedIfMatchResponse = await request(server)
      .delete('/api/v1/users/me/spaces/10/categories/42/budget')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .set('If-Match', 'not-a-timestamp');

    expect(malformedIfMatchResponse.status).toBe(400);
    const malformedIfMatchError = errorBody(malformedIfMatchResponse).error;
    expect(malformedIfMatchError.code).toBe('VALIDATION_FAILED');
    expect(malformedIfMatchError.details).toEqual([
      {
        field: '/headers/if-match',
        code: 'invalid_format',
        message:
          'Budget version must be a valid timestamp. Reload and review your edits before saving.',
      },
    ]);
    expect(budgetsService.deleteBudgetInSpace).not.toHaveBeenCalled();
  });
});

function updateCategoryRequest(server: Server, name: string) {
  return request(server)
    .patch('/api/v1/users/me/spaces/10/categories/42')
    .set('Authorization', 'Bearer token-a')
    .set('Accept', 'application/json')
    .send({ name, updatedAt: CATEGORY_VERSION });
}

function putBudgetRequest(
  server: Server,
  body: { amount: string; period: 'monthly' | 'yearly'; updatedAt?: string },
) {
  return request(server)
    .put('/api/v1/users/me/spaces/10/categories/42/budget')
    .set('Authorization', 'Bearer token-a')
    .set('Accept', 'application/json')
    .send(body);
}

function staleEditBody() {
  return {
    error: {
      code: 'STALE_EDIT',
      message:
        'This resource changed elsewhere. Reload and review your edits before saving.',
      details: [
        {
          field: '/updatedAt',
          code: 'incompatible',
          message:
            'The resource changed elsewhere. Reload and review your edits before saving.',
        },
      ],
    },
  };
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

function categoryRecord(updatedAt: string): CategoryRecord {
  const date = new Date('2026-09-01T00:00:00.000Z');
  return {
    id: '42',
    spaceId: '10',
    name: 'Housing',
    description: 'A place to live',
    color: 'plum',
    isActive: true,
    createdAt: date,
    updatedAt: new Date(updatedAt),
  };
}

function budgetRecord(
  categoryId: string,
  amount: string,
  period: 'monthly' | 'yearly',
  updatedAt: string,
): BudgetRecord {
  const date = new Date('2026-09-01T00:00:00.000Z');
  return {
    id: '7',
    categoryId,
    amount,
    period,
    createdAt: date,
    updatedAt: new Date(updatedAt),
  };
}

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    if (token !== 'token-a') {
      return Promise.reject(new Error('Invalid token'));
    }

    return Promise.resolve({
      userId: 'clerk_user_a',
      sessionId: 'session_a',
      claims: { sub: 'clerk_user_a' },
    });
  }
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  corsOrigins: ['https://app.example.com'],
  clerkJwtKey: 'test-jwt-key',
  clerkSecretKey: 'test-secret-key',
  clerkAuthorizedParties: ['https://app.example.com'],
};
