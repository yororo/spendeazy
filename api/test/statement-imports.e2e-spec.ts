import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReviewedImportService } from '../src/statement-imports/application/reviewed-import.service';
import { StatementImportPreviewsController } from '../src/statement-imports/presentation/statement-import-previews.controller';
import type { ConfirmationPayload } from '../src/statement-imports/application/confirmation-payload';
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
import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../src/spaces/application/space-errors';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { StatementImportsService } from '../src/statement-imports/application/statement-imports.service';
import { SpaceStatementImportsController } from '../src/statement-imports/presentation/space-statement-imports.controller';
import { USER_STORE } from '../src/users/application/user-store';

describe('Space Statement Import API routes', () => {
  let application: INestApplication;
  const access = {
    requireReadAccess: jest.fn(),
    requireWriteAccess: jest.fn(),
  };
  const previewService = { preview: jest.fn() };
  const service = {
    listStatementImportsInSpace: jest.fn(),
    getStatementImportInSpace: jest.fn(),
    commitReviewedStatementImportInSpace: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        SpaceStatementImportsController,
        StatementImportPreviewsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        {
          provide: CLERK_TOKEN_VERIFIER,
          useValue: new FakeClerkTokenVerifier(),
        },
        {
          provide: USER_STORE,
          useValue: {
            findByClerkUserId: jest.fn().mockResolvedValue({ id: '99' }),
          },
        },
        { provide: SpaceAccessService, useValue: access },
        { provide: StatementImportsService, useValue: service },
        { provide: ReviewedImportService, useValue: previewService },
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
    access.requireReadAccess.mockResolvedValue({ id: '77' });
    access.requireWriteAccess.mockResolvedValue({ id: '77', kind: 'personal' });
    service.listStatementImportsInSpace.mockResolvedValue({
      items: [historyRecord()],
      nextCursor: null,
    });
    service.getStatementImportInSpace.mockResolvedValue(importRecord());
    service.commitReviewedStatementImportInSpace.mockResolvedValue(
      importRecord(),
    );
  });

  afterAll(async () => {
    await application.close();
  });

  it('exposes complete reviewed preview with trusted actor/Space and rejects unknown nested evidence', async () => {
    const payload = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
        ),
        'utf8',
      ),
    ) as ConfirmationPayload;
    previewService.preview.mockResolvedValue({
      warnings: [],
      warningDigest: 'a'.repeat(64),
    });
    const response = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-import-previews')
      .set('Authorization', 'Bearer token-a')
      .send(payload);
    expect(response.status).toBe(200);
    expect(previewService.preview).toHaveBeenCalledWith('99', '77', payload);
    const invalid = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-import-previews')
      .set('Authorization', 'Bearer token-a')
      .send({
        ...payload,
        evidence: { ...payload.evidence, pageText: 'forbidden' },
      });
    expect(invalid.status).toBe(400);
    expect(previewService.preview).toHaveBeenCalledTimes(1);
  });
  it('authorizes and scopes history, detail and confirmation to the explicit Space', async () => {
    const history = await request(httpServer(application))
      .get('/api/v1/users/me/spaces/77/statement-imports')
      .query({ fromDate: '2026-08-01', pageSize: '10' })
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const detail = await request(httpServer(application))
      .get('/api/v1/users/me/spaces/77/statement-imports/400')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const commit = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(commitInput());

    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({
      items: [
        {
          id: '400',
          provider: 'bdo',
          accountFormat: 'amex',
          expenseCount: '1',
        },
      ],
    });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: '400',
      provider: 'bdo',
      accountFormat: 'amex',
      importedByUserId: '99',
    });
    expect(commit.status).toBe(201);
    expect(commit.headers.location).toBe(
      '/api/v1/users/me/spaces/77/statement-imports/400',
    );
    expect(access.requireReadAccess).toHaveBeenNthCalledWith(1, '99', '77');
    expect(access.requireReadAccess).toHaveBeenNthCalledWith(2, '99', '77');
    expect(access.requireWriteAccess).toHaveBeenCalledWith('99', '77');
    expect(service.listStatementImportsInSpace).toHaveBeenCalledWith('77', {
      fromDate: '2026-08-01',
      pageSize: 10,
    });
    expect(service.getStatementImportInSpace).toHaveBeenCalledWith('77', '400');
    expect(service.commitReviewedStatementImportInSpace).toHaveBeenCalledWith(
      '99',
      '77',
      commitInput(),
    );
  });

  it('does not run Space import operations when access is denied', async () => {
    access.requireReadAccess.mockRejectedValueOnce(new SpaceNotFoundError());
    access.requireWriteAccess.mockRejectedValueOnce(
      new SpaceNotWritableError(),
    );

    const read = await request(httpServer(application))
      .get('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const write = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(commitInput());

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
    expect(service.listStatementImportsInSpace).not.toHaveBeenCalled();
    expect(service.commitReviewedStatementImportInSpace).not.toHaveBeenCalled();
  });

  it('rejects legacy field names and category-less saved Expenses', async () => {
    const legacy = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ ...commitInput(), bank: 'Example Bank' });
    const missingCategory = commitInput();
    delete (missingCategory.expenses[0] as { categoryId?: string }).categoryId;
    const uncategorized = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(missingCategory);

    expect(legacy.status).toBe(400);
    expect(uncategorized.status).toBe(400);
    expect(service.commitReviewedStatementImportInSpace).not.toHaveBeenCalled();
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

function commitInput() {
  return {
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    statementType: 'credit_card',
    provider: 'bdo',
    accountFormat: 'amex',
    expenses: [
      {
        sourceRowId: 'row-1',
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    ],
  };
}

function importRecord() {
  return {
    id: '400',
    spaceId: '77',
    importedByUserId: '99',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    provider: 'bdo',
    accountFormat: 'amex',
    statementType: 'credit_card',
    historyFromDate: null,
    historyToDate: null,
    totalDebit: null,
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
  };
}

function historyRecord() {
  const record = importRecord();
  delete record.fileHash;
  return { ...record, expenseCount: '1' };
}

function httpServer(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  clerkJwtKey: 'test-jwt-key',
  clerkSecretKey: 'test-secret-key',
};
