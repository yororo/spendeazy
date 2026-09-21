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
import type { ManualTransactionRecord } from '../src/transactions/application/transaction-store';
import { TransactionsService } from '../src/transactions/application/transactions.service';
import { SpaceTransactionsController } from '../src/transactions/presentation/space-transactions.controller';
import { USER_STORE } from '../src/users/application/user-store';

const TRANSACTION_TIMESTAMP = '2026-09-20T00:00:00.000Z';

describe('Space transaction API routes', () => {
  let application: INestApplication;
  let verifier: FakeClerkTokenVerifier;
  const transaction = transactionRecord();
  const transactionsService = {
    listTransactionsInSpace: jest.fn().mockResolvedValue({
      items: [transaction],
      nextCursor: null,
    }),
    listTransactionActivityInSpace: jest.fn().mockResolvedValue([
      {
        id: '200',
        transactionId: '100',
        spaceId: '10',
        actorUserId: '8',
        type: 'created',
        occurredAt: new Date(TRANSACTION_TIMESTAMP),
      },
      {
        id: '201',
        transactionId: '100',
        spaceId: '10',
        actorUserId: '7',
        type: 'edited',
        occurredAt: new Date(TRANSACTION_TIMESTAMP),
        before: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        after: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Dinner',
          amount: '4.50',
        },
      },
    ]),
    createManualTransactionInSpace: jest.fn().mockResolvedValue(transaction),
    updateTransactionInSpace: jest.fn().mockResolvedValue(transaction),
    deleteManualTransactionInSpace: jest.fn().mockResolvedValue(undefined),
  };
  const spaceAccessService = {
    requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
  };

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    const module = await Test.createTestingModule({
      controllers: [SpaceTransactionsController],
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
        { provide: TransactionsService, useValue: transactionsService },
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
    spaceAccessService.requireReadAccess.mockResolvedValue({ id: '10' });
    spaceAccessService.requireWriteAccess.mockResolvedValue({ id: '10' });
  });

  afterAll(async () => {
    await application.close();
  });

  it('lists and writes through the selected Space boundary', async () => {
    const listResponse = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/10/transactions')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual({
      items: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          addedByUserId: '8',
        }),
      ],
      nextCursor: null,
    });
    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '42',
      '10',
    );
    expect(transactionsService.listTransactionsInSpace).toHaveBeenCalledWith(
      '10',
      {},
    );

    const activityResponse = await request(
      application.getHttpServer() as Server,
    )
      .get('/api/v1/users/me/spaces/10/transactions/100/activity')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(activityResponse.status).toBe(200);
    expect(activityResponse.body).toEqual([
      {
        id: '200',
        transactionId: '100',
        type: 'created',
        actorUserId: '8',
        occurredAt: TRANSACTION_TIMESTAMP,
      },
      {
        id: '201',
        transactionId: '100',
        type: 'edited',
        actorUserId: '7',
        occurredAt: TRANSACTION_TIMESTAMP,
        before: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        after: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Dinner',
          amount: '4.50',
        },
      },
    ]);
    expect(
      transactionsService.listTransactionActivityInSpace,
    ).toHaveBeenCalledWith('10', '100');

    const createResponse = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/spaces/10/transactions')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
        categoryId: '42',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.location).toBe(
      '/api/v1/users/me/spaces/10/transactions/100',
    );
    expect(
      transactionsService.createManualTransactionInSpace,
    ).toHaveBeenCalledWith('42', '10', {
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryId: '42',
    });

    const updateResponse = await request(application.getHttpServer() as Server)
      .patch('/api/v1/users/me/spaces/10/transactions/100')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ description: 'Dinner', updatedAt: TRANSACTION_TIMESTAMP });

    expect(updateResponse.status).toBe(200);
    expect(transactionsService.updateTransactionInSpace).toHaveBeenCalledWith(
      '42',
      '10',
      '100',
      { description: 'Dinner', expectedUpdatedAt: TRANSACTION_TIMESTAMP },
    );

    const deleteResponse = await request(application.getHttpServer() as Server)
      .delete('/api/v1/users/me/spaces/10/transactions/100')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .set('If-Match', `W/"${TRANSACTION_TIMESTAMP}"`);

    expect(deleteResponse.status).toBe(204);
    expect(
      transactionsService.deleteManualTransactionInSpace,
    ).toHaveBeenCalledWith('10', '100', TRANSACTION_TIMESTAMP);
  });

  it('does not disclose an inaccessible Space', async () => {
    spaceAccessService.requireReadAccess.mockRejectedValueOnce(
      new SpaceNotFoundError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/11/transactions')
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
    expect(transactionsService.listTransactionsInSpace).not.toHaveBeenCalled();
  });

  it('does not disclose activity for an inaccessible Space', async () => {
    spaceAccessService.requireReadAccess.mockRejectedValueOnce(
      new SpaceNotFoundError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/11/transactions/100/activity')
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
    expect(
      transactionsService.listTransactionActivityInSpace,
    ).not.toHaveBeenCalled();
  });
});

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

function transactionRecord(): ManualTransactionRecord {
  const date = new Date(TRANSACTION_TIMESTAMP);
  return {
    id: '100',
    userId: '8',
    spaceId: '10',
    addedByUserId: '8',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: date,
    updatedAt: date,
  };
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
