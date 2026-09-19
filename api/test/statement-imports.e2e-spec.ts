import { Test } from '@nestjs/testing';
import type { INestApplication, Provider } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import type { EntityManager } from 'typeorm';

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
  UNIT_OF_WORK,
  type TransactionContext,
  type UnitOfWork,
} from '../src/database/unit-of-work';
import { computeImportFingerprint } from '../src/statement-imports/application/import-fingerprint';
import { StatementImportsController } from '../src/statement-imports/presentation/statement-imports.controller';
import { StatementImportsService } from '../src/statement-imports/application/statement-imports.service';
import type {
  ImportedTransactionRecord,
  ImportedTransactionStore,
  NewImportedTransaction,
} from '../src/transactions/application/imported-transaction-store';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from '../src/transactions/application/transaction-category-store';
import {
  USER_STORE,
  type NewUser,
  type UpdateUser,
  type UserRecord,
  type UserStore,
} from '../src/users/application/user-store';
import {
  STATEMENT_IMPORT_STORE,
  type NewStatementImport,
  type StatementImportHistoryPageQuery,
  type StatementImportHistoryRecord,
  type StatementImportRecord,
  type StatementImportStore,
} from '../src/statement-imports/application/statement-import-store';

describe('authenticated statement-import routes', () => {
  let application: INestApplication;
  let statementImportsService: StatementImportsServiceMock;

  beforeEach(async () => {
    statementImportsService = createStatementImportsServiceMock();
    application = await createStatementImportApplication({
      provide: StatementImportsService,
      useValue: statementImportsService,
    });
  });

  afterEach(async () => {
    await application.close();
  });

  it('passes the trusted local User ID to history, retrieval, and commit operations', async () => {
    const userId = '99';
    const statementImport = statementImportRecord({ id: '400', userId });
    const historyItem = statementImportHistoryRecord({ id: '400', userId });
    const commitInput = statementImportInput();
    statementImportsService.listStatementImports.mockResolvedValue({
      items: [historyItem],
      nextCursor: 'next-page',
    });
    statementImportsService.getStatementImport.mockResolvedValue(
      statementImport,
    );
    statementImportsService.commitReviewedStatementImport.mockResolvedValue(
      statementImport,
    );

    const listResponse = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports')
      .query({
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        pageSize: '10',
      })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports/400')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const commitResponse = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send(commitInput);

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(commitResponse.status).toBe(201);
    expect(statementImportsService.listStatementImports).toHaveBeenCalledWith(
      userId,
      {
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        pageSize: 10,
      },
    );
    expect(statementImportsService.getStatementImport).toHaveBeenCalledWith(
      userId,
      '400',
    );
    expect(
      statementImportsService.commitReviewedStatementImport,
    ).toHaveBeenCalledWith(userId, commitInput);
    expect(commitResponse.headers.location).toBe(
      '/api/v1/users/me/statement-imports/400',
    );
    expect(commitResponse.body).toEqual({
      id: '400',
      fileName: 'august.pdf',
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      cardType: 'visa',
      importedAt: '2026-08-29T00:00:00.000Z',
    });
    expect(JSON.stringify(commitResponse.body)).not.toContain(
      commitInput.fileHash,
    );
  });

  it('does not treat caller-supplied User IDs as statement-import ownership', async () => {
    const userId = '99';
    statementImportsService.getStatementImport.mockResolvedValue(
      statementImportRecord({ userId }),
    );

    const listResponse = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports/400')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const commitResponse = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ ...statementImportInput(), userId: '8' });
    const nestedUserIdResponse = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        ...statementImportInput(),
        transactions: [
          { ...statementImportInput().transactions[0], userId: '8' },
        ],
      });

    expect(listResponse.status).toBe(400);
    expect(getResponse.status).toBe(200);
    expect(commitResponse.status).toBe(400);
    expect(nestedUserIdResponse.status).toBe(400);
    expect(statementImportsService.listStatementImports).not.toHaveBeenCalled();
    expect(
      statementImportsService.commitReviewedStatementImport,
    ).not.toHaveBeenCalled();
    expect(statementImportsService.getStatementImport).toHaveBeenCalledWith(
      userId,
      '400',
    );
  });

  it.each([
    [
      'statement-import collection read',
      'GET',
      '/api/v1/users/8/statement-imports',
    ],
    [
      'statement-import collection write',
      'POST',
      '/api/v1/users/8/statement-imports',
    ],
    [
      'statement-import item read',
      'GET',
      '/api/v1/users/8/statement-imports/400',
    ],
  ] as const)(
    'does not expose the legacy %s route',
    async (_name, method, path) => {
      const pending = statementRequestWithMethod(application, method, path)
        .set('Authorization', 'Bearer token-a')
        .set('Accept', 'application/json');
      if (method === 'POST') {
        pending.send(statementImportInput());
      }

      const response = await pending;

      expect(response.status).toBe(404);
      expect(statementImportsService.getStatementImport).not.toHaveBeenCalled();
      expect(
        statementImportsService.listStatementImports,
      ).not.toHaveBeenCalled();
      expect(
        statementImportsService.commitReviewedStatementImport,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'statement-import collection read',
      'GET',
      '/api/v1/users/me/statement-imports',
    ],
    [
      'statement-import collection write',
      'POST',
      '/api/v1/users/me/statement-imports',
    ],
    [
      'statement-import item read',
      'GET',
      '/api/v1/users/me/statement-imports/400',
    ],
  ] as const)(
    'returns 403 for an authenticated but unprovisioned caller on %s',
    async (_name, method, path) => {
      const pending = statementRequestWithMethod(application, method, path)
        .set('Authorization', 'Bearer token-b')
        .set('Accept', 'application/json');
      if (method === 'POST') {
        pending.send(statementImportInput());
      }

      const response = await pending;

      expect(response.status).toBe(403);
    },
  );

  it.each([
    [
      'statement-import collection',
      'GET',
      '/api/v1/users/me/statement-imports',
    ],
    [
      'statement-import collection write',
      'POST',
      '/api/v1/users/me/statement-imports',
    ],
    ['statement-import item', 'GET', '/api/v1/users/me/statement-imports/400'],
  ] as const)(
    'denies an anonymous request to %s',
    async (_name, method, path) => {
      const response = await statementRequestWithMethod(
        application,
        method,
        path,
      )
        .set('Accept', 'application/json')
        .send(method === 'POST' ? statementImportInput() : undefined);

      expect(response.status).toBe(401);
    },
  );
});

describe('statement-import ownership through authenticated routes', () => {
  let application: INestApplication;
  let fixture: StatementImportHttpFixture;

  beforeEach(async () => {
    fixture = new StatementImportHttpFixture();
    application = await createStatementImportApplication(
      StatementImportsService,
      fixture,
      fixture.statementImports,
    );
  });

  afterEach(async () => {
    await application.close();
  });

  it('returns non-disclosing 404s for absent and cross-user imports', async () => {
    fixture.statementImports.seed(
      statementImportRecord({ id: '501', userId: '42' }),
    );
    const absent = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports/404')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const crossUser = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports/501')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(absent.status).toBe(404);
    expect(crossUser.status).toBe(404);
    expect(crossUser.body).toEqual(absent.body);
  });

  it('only lists statement imports owned by the authenticated User', async () => {
    fixture.statementImports.seed(
      statementImportRecord({ id: '500', userId: '99' }),
      statementImportRecord({ id: '501', userId: '42' }),
    );

    const ownerHistory = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const otherUserHistory = await statementRequest(application)
      .get('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const ownerHistoryBody = ownerHistory.body as unknown as {
      items: { id: string }[];
    };
    const otherUserHistoryBody = otherUserHistory.body as unknown as {
      items: { id: string }[];
    };

    expect(ownerHistory.status).toBe(200);
    expect(ownerHistoryBody.items.map((item) => item.id)).toEqual(['500']);
    expect(otherUserHistory.status).toBe(200);
    expect(otherUserHistoryBody.items.map((item) => item.id)).toEqual(['501']);
    expect(
      fixture.statementImports.pageQueries.map((query) => query.userId),
    ).toEqual(['99', '42']);
  });

  it('scopes exact-file and probable-duplicate checks to the authenticated User', async () => {
    const input = statementImportInput();
    const fingerprint = computeImportFingerprint(input, input.transactions[0]);
    fixture.statementImports.seed(
      statementImportRecord({
        id: '500',
        userId: '99',
        fileHash: 'b'.repeat(64),
      }),
    );
    fixture.importedTransactions.seed(
      importedTransactionRecord({
        id: '700',
        userId: '99',
        statementImportId: '500',
        importFingerprint: fingerprint,
      }),
    );

    const exactDuplicate = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ ...input, fileHash: 'b'.repeat(64) });
    const sameFileForOtherUser = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ ...input, fileHash: 'b'.repeat(64) });
    const probableDuplicate = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ ...input, fileHash: 'e'.repeat(64) });

    expect(exactDuplicate.status).toBe(409);
    expect(errorCode(exactDuplicate)).toBe(
      'STATEMENT_IMPORT_FILE_ALREADY_EXISTS',
    );
    expect(sameFileForOtherUser.status).toBe(201);
    expect(probableDuplicate.status).toBe(409);
    expect(errorCode(probableDuplicate)).toBe(
      'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
    );
    expect(fixture.statementImports.createdInputs).toHaveLength(1);
    expect(fixture.statementImports.createdInputs[0]?.userId).toBe('42');
    expect(fixture.importedTransactions.createdInputs).toHaveLength(1);
    expect(fixture.importedTransactions.createdInputs[0]).toMatchObject({
      userId: '42',
    });
    expect(
      typeof fixture.importedTransactions.createdInputs[0]?.statementImportId,
    ).toBe('string');
  });

  it('requires categories to belong to the authenticated User and commits transactions in that scope', async () => {
    fixture.categories.seed({ id: '42', userId: '42', isActive: true });

    const crossUserCategory = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        ...statementImportInput(),
        fileHash: 'd'.repeat(64),
        transactions: [
          {
            ...statementImportInput().transactions[0],
            categoryId: '42',
          },
        ],
      });
    const missingCategory = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        ...statementImportInput(),
        fileHash: 'e'.repeat(64),
        transactions: [
          {
            ...statementImportInput().transactions[0],
            categoryId: '43',
          },
        ],
      });
    const ownedCategory = await statementRequest(application)
      .post('/api/v1/users/me/statement-imports')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({
        ...statementImportInput(),
        fileHash: 'f'.repeat(64),
        transactions: [
          {
            ...statementImportInput().transactions[0],
            categoryId: '42',
          },
        ],
      });

    expect(crossUserCategory.status).toBe(404);
    expect(missingCategory.status).toBe(404);
    expect(crossUserCategory.body).toEqual(missingCategory.body);
    expect(errorCode(crossUserCategory)).toBe('CATEGORY_NOT_FOUND');
    expect(ownedCategory.status).toBe(201);
    expect(fixture.statementImports.createdInputs).toHaveLength(1);
    expect(fixture.statementImports.createdInputs[0]?.userId).toBe('42');
    expect(fixture.importedTransactions.createdInputs).toHaveLength(1);
    expect(fixture.importedTransactions.createdInputs[0]).toMatchObject({
      userId: '42',
      categoryId: '42',
    });
  });
});

interface StatementImportsServiceMock {
  commitReviewedStatementImport: jest.Mock;
  getStatementImport: jest.Mock;
  listStatementImports: jest.Mock;
}

function createStatementImportsServiceMock(): StatementImportsServiceMock {
  return {
    commitReviewedStatementImport: jest
      .fn()
      .mockResolvedValue(statementImportRecord()),
    getStatementImport: jest.fn().mockResolvedValue(statementImportRecord()),
    listStatementImports: jest.fn().mockResolvedValue({
      items: [statementImportHistoryRecord()],
      nextCursor: null,
    }),
  };
}

async function createStatementImportApplication(
  statementImportsProvider:
    | typeof StatementImportsService
    | { provide: typeof StatementImportsService; useValue: unknown },
  unitOfWork?: UnitOfWork,
  statementImportStore?: StatementImportStore,
): Promise<INestApplication> {
  const providers: Provider[] = [
    { provide: APP_CONFIG, useValue: testConfig },
    {
      provide: CLERK_TOKEN_VERIFIER,
      useValue: new FakeClerkTokenVerifier(),
    },
    { provide: USER_STORE, useValue: new ProvisionedTestUserStore() },
    ClerkAuthenticationGuard,
    ProvisionedUserGuard,
    statementImportsProvider,
  ];
  if (unitOfWork !== undefined) {
    providers.push({ provide: UNIT_OF_WORK, useValue: unitOfWork });
  }
  if (statementImportStore !== undefined) {
    providers.push({
      provide: STATEMENT_IMPORT_STORE,
      useValue: statementImportStore,
    });
  }

  const module = await Test.createTestingModule({
    controllers: [StatementImportsController],
    providers,
  }).compile();

  const application = module.createNestApplication();
  configureApp(application, testConfig);
  await application.init();
  return application;
}

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    const users: Record<string, string> = {
      'token-a': 'user_a',
      'token-b': 'user_b',
      'token-c': 'user_c',
    };
    const userId = users[token];
    return userId === undefined
      ? Promise.reject(new Error('invalid token'))
      : Promise.resolve({
          userId,
          sessionId: `${userId}_session`,
          claims: { sub: userId },
        });
  }
}

class ProvisionedTestUserStore implements UserStore {
  private readonly users = new Map<string, UserRecord>([
    ['user_a', userRecord('42', 'user_a')],
    ['user_c', userRecord('99', 'user_c')],
  ]);

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.id === id) ?? null,
    );
  }

  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(clerkUserId) ?? null);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.email === email) ?? null,
    );
  }

  create(input: NewUser): Promise<UserRecord> {
    const timestamp = new Date('2026-08-31T00:00:00.000Z');
    const user: UserRecord = {
      id: String(this.users.size + 42),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(user.clerkUserId, user);
    return Promise.resolve(user);
  }

  update(id: string, input: UpdateUser): Promise<UserRecord | null> {
    const current = [...this.users.values()].find((user) => user.id === id);
    if (!current) return Promise.resolve(null);

    const updated = { ...current, ...input };
    this.users.set(updated.clerkUserId, updated);
    return Promise.resolve(updated);
  }
}

class StatementImportHttpFixture implements UnitOfWork {
  readonly statementImports = new HttpStatementImportStore();
  readonly importedTransactions = new HttpImportedTransactionStore();
  readonly categories = new HttpCategoryStore();
  private readonly context: TransactionContext = {
    entityManager: {} as EntityManager,
    users: new ProvisionedTestUserStore(),
    categories: this.categories,
    statementImports: this.statementImports,
    importedTransactions: this.importedTransactions,
  };

  execute<TResult>(
    work: (context: TransactionContext) => Promise<TResult>,
  ): Promise<TResult> {
    return work(this.context);
  }
}

class HttpStatementImportStore implements StatementImportStore {
  readonly createdInputs: NewStatementImport[] = [];
  readonly pageQueries: StatementImportHistoryPageQuery[] = [];
  private readonly imports: StatementImportRecord[] = [];
  private nextId = 900;

  seed(...records: StatementImportRecord[]): void {
    this.imports.push(...records);
  }

  findById(
    userId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null> {
    return Promise.resolve(
      this.imports.find(
        (statementImport) =>
          statementImport.userId === userId &&
          statementImport.id === statementImportId,
      ) ?? null,
    );
  }

  findByFileHash(
    userId: string,
    fileHash: string,
  ): Promise<StatementImportRecord | null> {
    return Promise.resolve(
      this.imports.find(
        (statementImport) =>
          statementImport.userId === userId &&
          statementImport.fileHash === fileHash,
      ) ?? null,
    );
  }

  findPage(
    query: StatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]> {
    this.pageQueries.push(query);
    const records = this.imports.filter((statementImport) => {
      if (statementImport.userId !== query.userId) return false;
      if (
        query.filters.fromDate !== undefined &&
        statementImport.statementDate < query.filters.fromDate
      ) {
        return false;
      }
      if (
        query.filters.toDate !== undefined &&
        statementImport.statementDate > query.filters.toDate
      ) {
        return false;
      }
      return true;
    });

    return Promise.resolve(
      records.slice(0, query.pageSize + 1).map(toHistoryRecord),
    );
  }

  create(input: NewStatementImport): Promise<StatementImportRecord> {
    this.createdInputs.push(input);
    const record = statementImportRecord({
      ...input,
      id: String(this.nextId++),
    });
    this.imports.push(record);
    return Promise.resolve(record);
  }
}

class HttpImportedTransactionStore implements ImportedTransactionStore {
  readonly createdInputs: NewImportedTransaction[] = [];
  private readonly transactions: ImportedTransactionRecord[] = [];

  seed(...records: ImportedTransactionRecord[]): void {
    this.transactions.push(...records);
  }

  findByFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<ImportedTransactionRecord[]> {
    return Promise.resolve(
      this.transactions.filter(
        (transaction) =>
          transaction.userId === userId &&
          transaction.importFingerprint === fingerprint,
      ),
    );
  }

  create(input: NewImportedTransaction): Promise<ImportedTransactionRecord> {
    this.createdInputs.push(input);
    const record = importedTransactionRecord({
      ...input,
      id: String(this.transactions.length + 1),
    });
    this.transactions.push(record);
    return Promise.resolve(record);
  }

  findById(
    userId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null> {
    return Promise.resolve(
      this.transactions.find(
        (transaction) => transaction.userId === userId && transaction.id === id,
      ) ?? null,
    );
  }

  updateCategory(): Promise<ImportedTransactionRecord | null> {
    return Promise.resolve(null);
  }
}

class HttpCategoryStore implements TransactionCategoryStore {
  private readonly categories: TransactionCategoryRecord[] = [];

  seed(...categories: TransactionCategoryRecord[]): void {
    this.categories.push(...categories);
  }

  findById(
    userId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.userId === userId && category.id === id,
      ) ?? null,
    );
  }
}

function userRecord(id: string, clerkUserId: string): UserRecord {
  const timestamp = new Date('2026-08-31T00:00:00.000Z');
  return {
    id,
    clerkUserId,
    name: clerkUserId === 'user_a' ? 'Ada Lovelace' : 'Grace Hopper',
    email: `${clerkUserId}@example.com`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function statementRequest(application: INestApplication) {
  return request(application.getHttpServer() as Server);
}

type StatementHttpMethod = 'GET' | 'POST';

function statementRequestWithMethod(
  application: INestApplication,
  method: StatementHttpMethod,
  path: string,
) {
  const client = statementRequest(application);
  return method === 'GET' ? client.get(path) : client.post(path);
}

function statementImportInput() {
  return {
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    transactions: [
      {
        categoryId: null,
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
        categoryMatchConfidence: null,
      },
    ],
  };
}

function statementImportRecord(
  overrides: Partial<StatementImportRecord> = {},
): StatementImportRecord {
  return {
    id: '400',
    userId: '42',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function statementImportHistoryRecord(
  overrides: Partial<StatementImportHistoryRecord> = {},
): StatementImportHistoryRecord {
  return {
    id: '400',
    userId: '42',
    fileName: 'august.pdf',
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    transactionCount: '1',
    ...overrides,
  };
}

function importedTransactionRecord(
  overrides: Partial<ImportedTransactionRecord> = {},
): ImportedTransactionRecord {
  return {
    id: '700',
    userId: '99',
    categoryId: null,
    statementImportId: '500',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: null,
    importFingerprint: 'c'.repeat(64),
    source: 'imported',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function toHistoryRecord(
  statementImport: StatementImportRecord,
): StatementImportHistoryRecord {
  return {
    id: statementImport.id,
    userId: statementImport.userId,
    fileName: statementImport.fileName,
    statementDate: statementImport.statementDate,
    bank: statementImport.bank,
    cardType: statementImport.cardType,
    importedAt: statementImport.importedAt,
    transactionCount: '0',
  };
}

function errorCode(response: { body: unknown }): string {
  const body = response.body;
  if (
    body === null ||
    typeof body !== 'object' ||
    !('error' in body) ||
    body.error === null ||
    typeof body.error !== 'object' ||
    !('code' in body.error) ||
    typeof body.error.code !== 'string'
  ) {
    throw new Error('Expected an error response');
  }

  return body.error.code;
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
