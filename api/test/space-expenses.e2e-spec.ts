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
import { SpaceNotFoundError } from '../src/spaces/application/space-errors';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import type { ManualExpenseRecord } from '../src/expenses/application/expense-store';
import { ExpensesService } from '../src/expenses/application/expenses.service';
import { SpaceExpensesController } from '../src/expenses/presentation/space-expenses.controller';
import { USER_STORE } from '../src/users/application/user-store';

const EXPENSE_TIMESTAMP = '2026-09-20T00:00:00.000Z';
const expense = expenseRecord();

const expensesService = {
  listExpensesInSpace: jest.fn().mockResolvedValue({
    items: [expense],
    nextCursor: null,
    totalCount: '1',
    totalAmount: '4.50',
  }),
  listDeletedExpensesInSpace: jest.fn().mockResolvedValue({
    items: [{ ...expense, deletedAt: new Date(EXPENSE_TIMESTAMP) }],
    nextCursor: null,
    totalCount: '1',
    totalAmount: '4.50',
  }),
  listExpenseActivityInSpace: jest.fn().mockResolvedValue([
    {
      id: '200',
      expenseId: '100',
      spaceId: '10',
      actorUserId: '8',
      type: 'created',
      occurredAt: new Date(EXPENSE_TIMESTAMP),
      after: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    },
    {
      id: '201',
      expenseId: '100',
      spaceId: '10',
      actorUserId: '7',
      type: 'edited',
      occurredAt: new Date(EXPENSE_TIMESTAMP),
      before: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
      after: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Dinner',
        amount: '4.50',
      },
    },
  ]),
  createManualExpenseInSpace: jest.fn().mockResolvedValue(expense),
  getExpenseInSpace: jest.fn().mockResolvedValue(expense),
  updateSharedExpenseInSpace: jest.fn().mockResolvedValue(expense),
  deleteExpenseInSpace: jest.fn().mockResolvedValue({
    ...expense,
    deletedAt: new Date(EXPENSE_TIMESTAMP),
    revision: '2',
  }),
};

const spaceAccessService = {
  requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
  requireWriteAccess: jest.fn().mockResolvedValue({ id: '10', kind: 'shared' }),
};

describe('Space Expense API routes', () => {
  let application: INestApplication;

  beforeAll(async () => {
    const verifier = new FakeClerkTokenVerifier();
    const module = await Test.createTestingModule({
      controllers: [SpaceExpensesController],
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
        { provide: ExpensesService, useValue: expensesService },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    application = module.createNestApplication();
    configureApp(application);
    await application.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    spaceAccessService.requireReadAccess.mockResolvedValue({ id: '10' });
    spaceAccessService.requireWriteAccess.mockResolvedValue({
      id: '10',
      kind: 'shared',
    });
    expensesService.listExpensesInSpace.mockResolvedValue({
      items: [expense],
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expensesService.listDeletedExpensesInSpace.mockResolvedValue({
      items: [{ ...expense, deletedAt: new Date(EXPENSE_TIMESTAMP) }],
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expensesService.getExpenseInSpace.mockResolvedValue(expense);
    expensesService.deleteExpenseInSpace.mockResolvedValue({
      ...expense,
      deletedAt: new Date(EXPENSE_TIMESTAMP),
      revision: '2',
    });
  });

  afterAll(async () => {
    await application.close();
  });

  it('lists selected-Space Expenses with exact full-selection totals', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/10/expenses')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      expenses: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          addedByUserId: '8',
          categoryId: '42',
          revision: '1',
        }),
      ],
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '42',
      '10',
    );
    expect(expensesService.listExpensesInSpace).toHaveBeenCalledWith('10', {});
  });

  it('lists retained deleted Expenses separately', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/10/expenses/deleted')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      expenses: [{ id: '100', deletedAt: EXPENSE_TIMESTAMP }],
      totalCount: '1',
      totalAmount: '4.50',
    });
    expect(expensesService.listDeletedExpensesInSpace).toHaveBeenCalledWith(
      '10',
      {},
    );
  });

  it('reads Expense Activity with Expense IDs and date-only snapshots', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/10/expenses/100/activity')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: '200',
        expenseId: '100',
        type: 'created',
        actorUserId: '8',
        occurredAt: EXPENSE_TIMESTAMP,
        after: {
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
      },
      {
        id: '201',
        expenseId: '100',
        type: 'edited',
        actorUserId: '7',
        occurredAt: EXPENSE_TIMESTAMP,
        before: {
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        after: {
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: 'Dinner',
          amount: '4.50',
        },
      },
    ]);
    expect(expensesService.listExpenseActivityInSpace).toHaveBeenCalledWith(
      '10',
      '100',
    );
  });

  it('creates, edits and deletes through revision-bound Space routes', async () => {
    const createResponse = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/spaces/10/expenses')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
        categoryId: '42',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.location).toBe(
      '/api/v1/users/me/spaces/10/expenses/100',
    );
    expect(expensesService.createManualExpenseInSpace).toHaveBeenCalledWith(
      '42',
      '10',
      {
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
        categoryId: '42',
      },
    );

    const updateResponse = await request(application.getHttpServer() as Server)
      .patch('/api/v1/users/me/spaces/10/expenses/100')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ description: 'Dinner', expectedRevision: '1' });

    expect(updateResponse.status).toBe(200);
    expect(expensesService.updateSharedExpenseInSpace).toHaveBeenCalledWith(
      '42',
      '10',
      '100',
      {
        description: 'Dinner',
        expectedRevision: '1',
      },
    );

    const deleteResponse = await request(application.getHttpServer() as Server)
      .delete('/api/v1/users/me/spaces/10/expenses/100')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .set('If-Match', '"1"');

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toMatchObject({
      id: '100',
      source: 'manual',
      revision: '2',
      deletedAt: EXPENSE_TIMESTAMP,
    });
    expect(expensesService.deleteExpenseInSpace).toHaveBeenCalledWith(
      '42',
      '10',
      '100',
      '1',
    );
  });

  it('does not expose the removed saved-Transaction alias', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/10/transactions')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(expensesService.listExpensesInSpace).not.toHaveBeenCalled();
  });

  it('does not disclose an inaccessible Space', async () => {
    spaceAccessService.requireReadAccess.mockRejectedValueOnce(
      new SpaceNotFoundError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/11/expenses')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'SPACE_NOT_FOUND',
        message: 'Space was not found',
        details: [],
      },
    });
    expect(expensesService.listExpensesInSpace).not.toHaveBeenCalled();
  });
});

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    if (token !== 'token-a') return Promise.reject(new Error('Invalid token'));
    return Promise.resolve({
      userId: 'clerk_user_a',
      sessionId: 'session_a',
      claims: { sub: 'clerk_user_a' },
    });
  }
}

function expenseRecord(): ManualExpenseRecord {
  const date = new Date(EXPENSE_TIMESTAMP);
  return {
    id: '100',
    spaceId: '10',
    addedByUserId: '8',
    categoryId: '42',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: date,
    updatedAt: date,
    revision: '1',
  };
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  clerkJwtKey: 'test-jwt-key',
  clerkSecretKey: 'test-secret-key',
};
