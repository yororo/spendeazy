import { StatementImportOperationsController } from '../src/statement-imports/presentation/statement-import-operations.controller';
import {
  ImportConfirmationError,
  ImportReviewRequiredError,
} from '../src/statement-imports/application/import-confirmation-errors';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReviewedImportService } from '../src/statement-imports/application/reviewed-import.service';
import { StatementImportPreviewsController } from '../src/statement-imports/presentation/statement-import-previews.controller';
import type { ConfirmationPayload } from '../src/statement-imports/application/confirmation-payload';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  confirmationEnvelope,
  envelopeBytes,
} from './support/confirmation-envelope';
import { validateConfirmationPayload } from '../src/statement-imports/application/validate-confirmation-payload';

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
  const previewService = {
    preview: jest.fn(),
    confirm: jest.fn(),
    evidenceRows: jest.fn(),
  };
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
        StatementImportOperationsController,
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
    previewService.evidenceRows.mockResolvedValue([]);
    access.requireReadAccess.mockResolvedValue({ id: '77' });
    access.requireWriteAccess.mockResolvedValue({ id: '77', kind: 'personal' });
    service.listStatementImportsInSpace.mockResolvedValue({
      items: [historyRecord()],
      nextCursor: null,
    });
    service.getStatementImportInSpace.mockResolvedValue(importRecord());
    previewService.confirm.mockResolvedValue({
      result: committedResult(),
      replayed: false,
    });
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
      .put(
        '/api/v1/users/me/spaces/77/statement-import-operations/11111111-1111-4111-8111-111111111111',
      )
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(completeInput());

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
    expect(access.requireWriteAccess).not.toHaveBeenCalled();
    expect(service.listStatementImportsInSpace).toHaveBeenCalledWith('77', {
      fromDate: '2026-08-01',
      pageSize: 10,
    });
    expect(service.getStatementImportInSpace).toHaveBeenCalledWith('77', '400');
    expect(previewService.confirm).toHaveBeenCalledWith(
      '99',
      '77',
      '11111111-1111-4111-8111-111111111111',
      completeInput(),
    );
  });

  it('does not run Space import operations when access is denied', async () => {
    access.requireReadAccess.mockRejectedValueOnce(new SpaceNotFoundError());
    previewService.confirm.mockRejectedValueOnce(new SpaceNotWritableError());

    const read = await request(httpServer(application))
      .get('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const write = await request(httpServer(application))
      .put(operationPath)
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(completeInput());

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
    expect(service.listStatementImportsInSpace).not.toHaveBeenCalled();
    expect(previewService.confirm).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy field names and category-less saved Expenses', async () => {
    const legacy = await request(httpServer(application))
      .put(operationPath)
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ ...completeInput(), bank: 'Example Bank' });
    const missingCategory = completeInput();
    delete (missingCategory.expenses[0] as { categoryId?: string }).categoryId;
    const uncategorized = await request(httpServer(application))
      .put(operationPath)
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send(missingCategory);

    expect(legacy.status).toBe(400);
    expect(uncategorized.status).toBe(400);
    expect(previewService.confirm).not.toHaveBeenCalled();
  });
  it('returns immutable 200 replay and does not preflight write access', async () => {
    previewService.confirm.mockResolvedValue({
      result: committedResult(),
      replayed: true,
    });
    const response = await request(httpServer(application))
      .put(operationPath)
      .set('Authorization', 'Bearer token-a')
      .send(completeInput());
    expect(response.status).toBe(200);
    expect(response.body).toEqual(committedResult());
    expect(response.headers.location).toBe(
      '/api/v1/users/me/spaces/77/statement-imports/400',
    );
    expect(access.requireWriteAccess).not.toHaveBeenCalled();
  });
  it('publishes safe typed conflicts, refreshed warnings and terminal failure statuses', async () => {
    const review = { warnings: [], warningDigest: 'a'.repeat(64) };
    for (const [error, status, code] of [
      [new ImportReviewRequiredError(review), 409, 'IMPORT_REVIEW_REQUIRED'],
      [
        new ImportConfirmationError({
          code: 'IMPORT_OPERATION_PAYLOAD_CONFLICT',
          details: [],
        }),
        409,
        'IMPORT_OPERATION_PAYLOAD_CONFLICT',
      ],
      [
        new ImportConfirmationError({
          code: 'VALIDATION_FAILED',
          details: [{ field: '/expenses/0', code: 'invalid_value' }],
        }),
        400,
        'VALIDATION_FAILED',
      ],
      [new SpaceNotFoundError(), 404, 'SPACE_NOT_FOUND'],
    ] as const) {
      previewService.confirm.mockRejectedValueOnce(error);
      const response = await request(httpServer(application))
        .put(operationPath)
        .set('Authorization', 'Bearer token-a')
        .send(completeInput());
      expect(response.status).toBe(status);
      const body = response.body as {
        error: { code: string; review?: unknown };
      };
      expect(body.error.code).toBe(code);
      if (code === 'IMPORT_REVIEW_REQUIRED')
        expect(body.error.review).toEqual(review);
    }
  });
  it('removes the old POST and rejects unknown nested fields and malformed operation IDs', async () => {
    const old = await request(httpServer(application))
      .post('/api/v1/users/me/spaces/77/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .send(completeInput());
    expect(old.status).toBe(404);
    const payload = completeInput();
    const nested = await request(httpServer(application))
      .put(operationPath)
      .set('Authorization', 'Bearer token-a')
      .send({
        ...payload,
        evidence: { ...payload.evidence, rawText: 'forbidden' },
      });
    expect(nested.status).toBe(400);
    const invalid = await request(httpServer(application))
      .put(operationPath.replace(operationId, 'invalid'))
      .set('Authorization', 'Bearer token-a')
      .send(payload);
    expect(invalid.status).toBe(400);
    expect(previewService.confirm).not.toHaveBeenCalled();
  });
  it.each(['bdo', 'eastwest', 'gcash'] as const)(
    'measures complete %s UTF-8 envelopes without omitting evidence or acknowledgments',
    (provider) => {
      const measuredBytes = {
        bdo: [6264, 465651, 1400251],
        eastwest: [6274, 465661, 1400261],
        gcash: [6689, 507566, 1528166],
      };
      const actualBytes: number[] = [];
      for (const blocks of [1, 100, 300]) {
        const payload = confirmationEnvelope(provider, blocks);
        expect(() =>
          validateConfirmationPayload(
            payload,
            new Date('2026-10-30T00:00:00Z'),
          ),
        ).not.toThrow();
        expect(payload.evidence.transactions).toHaveLength(blocks * 10);
        expect(payload.expenses.length + payload.excluded.length).toBe(
          blocks * 10,
        );
        expect(payload.rememberedRules).toHaveLength(1);
        expect(payload.acknowledgedWarnings).toHaveLength(3);
        expect(envelopeBytes(payload)).toBeGreaterThan(
          JSON.stringify(payload).length,
        );
        expect(envelopeBytes(payload) < 1024 * 1024).toBe(blocks < 300);
        actualBytes.push(envelopeBytes(payload));
      }
      // Keep the published measurement table honest when fixture shapes change.
      expect(actualBytes).toEqual(measuredBytes[provider]);
    },
  );
  it.each(['bdo', 'eastwest', 'gcash'] as const)(
    'rejects the complete oversized %s ledger without dispatching confirmation',
    async (provider) => {
      const response = await request(httpServer(application))
        .put(operationPath)
        .set('Authorization', 'Bearer token-a')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(confirmationEnvelope(provider, 300)));
      expect(response.status).toBe(413);
      expect(previewService.confirm).not.toHaveBeenCalled();
    },
  );
  it.each(['preview', 'operation'] as const)(
    'enforces just-under/over 1 MiB through the real %s HTTP parser',
    async (route) => {
      const payload = confirmationEnvelope('gcash', 100);
      validateConfirmationPayload(payload, new Date('2026-10-30T00:00:00Z'));
      const json = JSON.stringify(payload);
      // Legal trailing JSON whitespace makes the boundary exact without changing
      // or removing any evidence. Multi-byte row text tests bytes, not JS length.
      const under = json + ' '.repeat(1024 * 1024 - 1 - envelopeBytes(payload));
      const over = under + '  ';
      expect(Buffer.byteLength(under, 'utf8')).toBe(1024 * 1024 - 1);
      expect(Buffer.byteLength(over, 'utf8')).toBe(1024 * 1024 + 1);
      previewService.preview.mockResolvedValue({
        warnings: [],
        warningDigest: 'a'.repeat(64),
      });
      const send = (body: string) => {
        const client = request(httpServer(application));
        return (
          route === 'operation'
            ? client.put(operationPath)
            : client.post(
                '/api/v1/users/me/spaces/77/statement-import-previews',
              )
        )
          .set('Authorization', 'Bearer token-a')
          .set('Content-Type', 'application/json')
          .send(body);
      };
      const accepted = await send(under);
      expect(accepted.status).toBe(route === 'operation' ? 201 : 200);
      const service =
        route === 'operation' ? previewService.confirm : previewService.preview;
      expect(service).toHaveBeenCalledTimes(1);
      if (route === 'operation') {
        expect(previewService.confirm).toHaveBeenCalledWith(
          '99',
          '77',
          operationId,
          payload,
        );
      } else {
        expect(previewService.preview).toHaveBeenCalledWith(
          '99',
          '77',
          payload,
        );
      }
      const rejected = await send(over);
      expect(rejected.status).toBe(413);
      expect(service).toHaveBeenCalledTimes(1);
    },
  );
  it('requires authenticated actor authority before invoking the operation service', async () => {
    const response = await request(httpServer(application))
      .put(operationPath)
      .send(completeInput());
    expect(response.status).toBe(401);
    expect(previewService.confirm).not.toHaveBeenCalled();
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

function completeInput(): ConfirmationPayload {
  return JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
      ),
      'utf8',
    ),
  ) as ConfirmationPayload;
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

const operationId = '11111111-1111-4111-8111-111111111111';
const operationPath =
  '/api/v1/users/me/spaces/77/statement-import-operations/' + operationId;
function committedResult() {
  return {
    status: 'committed',
    operationId,
    statementImportId: '400',
    confirmedAt: '2026-10-30T00:00:00.000Z',
    originalExpenseCount: '2',
    originalExpenseTotal: '1300.00',
  };
}
