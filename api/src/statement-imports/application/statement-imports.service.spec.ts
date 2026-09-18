import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from '../../transactions/application/transaction-category-store';
import type {
  ImportedTransactionRecord,
  ImportedTransactionStore,
  NewImportedTransaction,
} from '../../transactions/application/imported-transaction-store';
import {
  StatementImportFileAlreadyExistsError,
  StatementImportNotFoundError,
  STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
  StatementImportValidationError,
} from './statement-import-errors';
import type {
  NewStatementImport,
  StatementImportHistoryPageQuery,
  StatementImportHistoryRecord,
  StatementImportRecord,
  StatementImportStore,
} from './statement-import-store';
import { StatementImportsService } from './statement-imports.service';
import { decodeStatementImportCursor } from './statement-import-cursor';
import { computeImportFingerprint } from './import-fingerprint';
import type {
  TransactionContext,
  UnitOfWork,
} from '../../database/unit-of-work';
import type { EntityManager } from 'typeorm';
import { ApplicationError } from '../../errors/application-error';
import { UserNotFoundError } from '../../users/application/user-errors';
import type { UserRecord, UserStore } from '../../users/application/user-store';

describe('StatementImportsService', () => {
  it('commits the statement and every reviewed transaction in one unit of work', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake();
    const categories = new TransactionCategoryStoreFake([
      categoryRecord({ id: '42' }),
    ]);
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories,
    });
    const service = new StatementImportsService(unitOfWork);

    const committedImport = await service.commitReviewedStatementImport(
      '7',
      statementInput(),
    );

    expect(unitOfWork.executeCalls).toBe(1);
    expect(committedImport).toEqual(statementImports.createdImport);
    expect(statementImports.createdInput).toMatchObject({
      userId: '7',
      fileName: 'august.pdf',
      fileHash: validFileHash(),
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      cardType: 'visa',
    });
    expect(importedTransactions.createdInputs).toHaveLength(2);
    expect(importedTransactions.createdInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: '7',
          statementImportId: '100',
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          categoryMatchConfidence: '0.9000',
        }),
        expect.objectContaining({
          userId: '7',
          statementImportId: '100',
          categoryId: null,
          purchaseDate: '2026-08-02',
          description: 'Bookstore',
          amount: '18.00',
          categoryMatchConfidence: null,
        }),
      ]),
    );
    expect(
      importedTransactions.createdInputs.every((input) =>
        /^[0-9a-f]{64}$/u.test(input.importFingerprint),
      ),
    ).toBe(true);
  });

  it('rejects an exact file duplicate before creating any records', async () => {
    const statementImports = new StatementImportStoreFake([
      statementRecord({ fileHash: validFileHash() }),
    ]);
    const importedTransactions = new ImportedTransactionStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('7', {
        ...statementInput(),
        acknowledgeProbableDuplicates: true,
      }),
    ).rejects.toBeInstanceOf(StatementImportFileAlreadyExistsError);

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedTransactions.createdInputs).toEqual([]);
  });

  it('rejects probable duplicates with deterministic grouped details before writing', async () => {
    const input = statementInput();
    const duplicateTransaction = input.transactions[0];
    const duplicateFingerprint = computeImportFingerprint(
      input,
      duplicateTransaction,
    );
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake(
      new Map([
        [
          duplicateFingerprint,
          [
            importedTransactionRecord({
              id: '12',
              importFingerprint: duplicateFingerprint,
            }),
          ],
        ],
      ]),
    );
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake([
        categoryRecord({ id: '42' }),
      ]),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('7', {
        ...input,
        transactions: [duplicateTransaction, duplicateTransaction],
      }),
    ).rejects.toMatchObject({
      code: STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
      details: [
        expect.objectContaining({
          field: '/transactions/0',
          code: 'probable_duplicate',
          transactionIndexes: [0, 1],
          committedTransactionIds: ['12'],
        }),
      ],
    });

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedTransactions.createdInputs).toEqual([]);
  });

  it('acknowledges every probable duplicate and preserves every reviewed row', async () => {
    const input = statementInput();
    const duplicateTransaction = input.transactions[0];
    const duplicateFingerprint = computeImportFingerprint(
      input,
      duplicateTransaction,
    );
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake(
      new Map([
        [
          duplicateFingerprint,
          [
            importedTransactionRecord({
              id: '12',
              importFingerprint: duplicateFingerprint,
            }),
          ],
        ],
      ]),
    );
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake([
        categoryRecord({ id: '42' }),
      ]),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('7', {
        ...input,
        acknowledgeProbableDuplicates: true,
        transactions: [duplicateTransaction, duplicateTransaction],
      }),
    ).resolves.toBeDefined();

    expect(importedTransactions.createdInputs).toHaveLength(2);
  });

  it('resolves every category before the first write and rejects missing or inactive categories', async () => {
    for (const category of [
      undefined,
      categoryRecord({ id: '43', isActive: false }),
    ]) {
      const statementImports = new StatementImportStoreFake();
      const importedTransactions = new ImportedTransactionStoreFake();
      const unitOfWork = new UnitOfWorkFake({
        entityManager: {} as EntityManager,
        users: userStore(),
        statementImports,
        importedTransactions,
        categories: new TransactionCategoryStoreFake(
          category ? [categoryRecord(), category] : [categoryRecord()],
        ),
      });
      const service = new StatementImportsService(unitOfWork);

      await expect(
        service.commitReviewedStatementImport('7', {
          ...statementInput(),
          transactions: [
            statementInput().transactions[0],
            { ...statementInput().transactions[1], categoryId: '43' },
          ],
        }),
      ).rejects.toEqual(
        category
          ? expect.any(CategoryInactiveError)
          : expect.any(CategoryNotFoundError),
      );

      expect(statementImports.createdInput).toBeUndefined();
      expect(importedTransactions.createdInputs).toEqual([]);
    }
  });

  it('checks reviewed statement fields before any persistence call', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('7', {
        ...statementInput(),
        fileName: ' ',
        statementDate: '2026-02-29',
        bank: ' ',
        transactions: [
          {
            ...statementInput().transactions[0],
            description: ' ',
            amount: '4',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(StatementImportValidationError);

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedTransactions.createdInputs).toEqual([]);
  });

  it('rejects an unknown user before checking or writing statement data', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(null),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('999', statementInput()),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedTransactions.createdInputs).toEqual([]);
  });

  it('stops issuing later transaction writes when one write fails', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedTransactions = new ImportedTransactionStoreFake();
    importedTransactions.failOnCreateNumber = 2;
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions,
      categories: new TransactionCategoryStoreFake([
        categoryRecord({ id: '42' }),
      ]),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.commitReviewedStatementImport('7', statementInput()),
    ).rejects.toThrow('transaction write failed');

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedTransactions.createdInputs).toHaveLength(2);
    expect(importedTransactions.createCallCount).toBe(2);
    expect(statementImports.persistedInputs).toEqual([]);
    expect(importedTransactions.persistedInputs).toEqual([]);
  });

  it('lists an owned statement-import page in stable order and binds its cursor to filters', async () => {
    const statementImports = new StatementImportStoreFake(
      [],
      [
        statementImportHistoryRecord({ id: '3', statementDate: '2026-08-03' }),
        statementImportHistoryRecord({ id: '2', statementDate: '2026-08-03' }),
        statementImportHistoryRecord({ id: '1', statementDate: '2026-08-02' }),
      ],
    );
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions: new ImportedTransactionStoreFake(),
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);
    const filters = {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    };

    const page = await service.listStatementImports('7', {
      ...filters,
      pageSize: 2,
    });

    expect(page.items).toEqual(statementImports.pageResults.slice(0, 2));
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(
      decodeStatementImportCursor(page.nextCursor ?? '', filters).position,
    ).toEqual({ statementDate: '2026-08-03', statementImportId: '2' });
    expect(statementImports.pageQuery).toEqual({
      userId: '7',
      filters,
      after: null,
      pageSize: 2,
    });

    statementImports.pageResults = [
      statementImportHistoryRecord({ id: '1', statementDate: '2026-08-02' }),
    ];
    await expect(
      service.listStatementImports('7', {
        ...filters,
        pageSize: 1,
        cursor: page.nextCursor ?? undefined,
      }),
    ).resolves.toEqual({
      items: statementImports.pageResults,
      nextCursor: null,
    });
    expect(statementImports.pageQuery).toEqual({
      userId: '7',
      filters,
      after: { statementDate: '2026-08-03', statementImportId: '2' },
      pageSize: 1,
    });
  });

  it('retrieves only an owned statement import and maps absent identifiers to not found', async () => {
    const ownedImport = statementRecord({ id: '108', userId: '42' });
    const statementImports = new StatementImportStoreFake([
      ownedImport,
      statementRecord({ id: '109', userId: '7' }),
    ]);
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions: new ImportedTransactionStoreFake(),
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(service.getStatementImport('42', '108')).resolves.toEqual(
      ownedImport,
    );
    await expect(service.getStatementImport('42', '109')).rejects.toEqual(
      expect.any(StatementImportNotFoundError),
    );
    await expect(service.getStatementImport('42', '404')).rejects.toEqual(
      expect.any(StatementImportNotFoundError),
    );
  });

  it('does not return history owned by another user', async () => {
    const statementImports = new StatementImportStoreFake(
      [],
      [
        statementImportHistoryRecord({ id: '1', userId: '7' }),
        statementImportHistoryRecord({ id: '2', userId: '8' }),
      ],
    );
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports,
      importedTransactions: new ImportedTransactionStoreFake(),
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(service.listStatementImports('7', {})).resolves.toEqual({
      items: [statementImports.pageResults[0]],
      nextCursor: null,
    });
    expect(statementImports.pageQuery?.userId).toBe('7');
  });

  it('rejects an empty cursor instead of treating it as the first page', async () => {
    const unitOfWork = new UnitOfWorkFake({
      entityManager: {} as EntityManager,
      users: userStore(),
      statementImports: new StatementImportStoreFake(),
      importedTransactions: new ImportedTransactionStoreFake(),
      categories: new TransactionCategoryStoreFake(),
    });
    const service = new StatementImportsService(unitOfWork);

    await expect(
      service.listStatementImports('7', { cursor: '' }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});

class UnitOfWorkFake implements UnitOfWork {
  executeCalls = 0;

  constructor(private readonly context: TransactionContext) {}

  async execute<TResult>(
    work: (context: TransactionContext) => Promise<TResult>,
  ): Promise<TResult> {
    this.executeCalls += 1;
    try {
      return await work(this.context);
    } catch (error: unknown) {
      (this.context.statementImports as StatementImportStoreFake).rollback();
      (
        this.context.importedTransactions as ImportedTransactionStoreFake
      ).rollback();
      throw error;
    }
  }
}

class StatementImportStoreFake implements StatementImportStore {
  createdInput: NewStatementImport | undefined;
  createdImport: StatementImportRecord | undefined;
  readonly persistedInputs: NewStatementImport[] = [];
  pageQuery: StatementImportHistoryPageQuery | undefined;
  pageResults: StatementImportHistoryRecord[];

  constructor(
    private readonly imports: StatementImportRecord[] = [],
    pageResults: StatementImportHistoryRecord[] = [],
  ) {
    this.pageResults = pageResults;
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

  create(input: NewStatementImport): Promise<StatementImportRecord> {
    this.createdInput = input;
    this.persistedInputs.push(input);
    this.createdImport = statementRecord({
      id: '100',
      userId: input.userId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      statementDate: input.statementDate,
      bank: input.bank,
      cardType: input.cardType,
      importedAt: input.importedAt,
    });
    return Promise.resolve(this.createdImport);
  }

  findPage(
    query: StatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]> {
    this.pageQuery = query;
    return Promise.resolve(
      this.pageResults.filter(
        (statementImport) => statementImport.userId === query.userId,
      ),
    );
  }

  rollback(): void {
    this.createdInput = undefined;
    this.createdImport = undefined;
    this.persistedInputs.length = 0;
  }
}

class ImportedTransactionStoreFake implements ImportedTransactionStore {
  readonly createdInputs: NewImportedTransaction[] = [];
  readonly persistedInputs: NewImportedTransaction[] = [];
  failOnCreateNumber: number | undefined;

  constructor(
    private readonly matchesByFingerprint: ReadonlyMap<
      string,
      ImportedTransactionRecord[]
    > = new Map(),
  ) {}

  get createCallCount(): number {
    return this.createdInputs.length;
  }

  findByFingerprint(
    _userId: string,
    fingerprint: string,
  ): Promise<ImportedTransactionRecord[]> {
    return Promise.resolve(this.matchesByFingerprint.get(fingerprint) ?? []);
  }

  create(input: NewImportedTransaction): Promise<ImportedTransactionRecord> {
    this.createdInputs.push(input);
    this.persistedInputs.push(input);
    if (this.createdInputs.length === this.failOnCreateNumber) {
      return Promise.reject(new Error('transaction write failed'));
    }

    return Promise.resolve({
      id: String(this.createdInputs.length),
      ...input,
      source: 'imported',
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    });
  }

  findById(): Promise<ImportedTransactionRecord | null> {
    return Promise.resolve(null);
  }

  updateCategory(): Promise<ImportedTransactionRecord | null> {
    return Promise.resolve(null);
  }

  rollback(): void {
    this.persistedInputs.length = 0;
  }
}

class TransactionCategoryStoreFake implements TransactionCategoryStore {
  constructor(private readonly categories: TransactionCategoryRecord[] = []) {}

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

function statementInput() {
  return {
    fileName: 'august.pdf',
    fileHash: validFileHash(),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    transactions: [
      {
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
        categoryMatchConfidence: '0.9000',
      },
      {
        categoryId: null,
        purchaseDate: '2026-08-02',
        description: 'Bookstore',
        amount: '18.00',
        categoryMatchConfidence: null,
      },
    ],
  };
}

function userStore(user: UserRecord | null = userRecord()): UserStore {
  return {
    findById: () => Promise.resolve(user),
    findByEmail: () => Promise.resolve(null),
    create: (input) => Promise.resolve({ ...userRecord(), ...input }),
    update: (_id, input) =>
      Promise.resolve(user ? { ...user, ...input } : null),
  };
}

function userRecord(): UserRecord {
  return {
    id: '7',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
  };
}

function importedTransactionRecord(
  overrides: Partial<ImportedTransactionRecord> = {},
): ImportedTransactionRecord {
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    statementImportId: '100',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: '0.9000',
    importFingerprint: 'a'.repeat(64),
    source: 'imported',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function validFileHash(): string {
  return 'a'.repeat(64);
}

function categoryRecord(
  overrides: Partial<TransactionCategoryRecord> = {},
): TransactionCategoryRecord {
  return {
    id: '42',
    userId: '7',
    isActive: true,
    ...overrides,
  };
}

function statementRecord(
  overrides: Partial<StatementImportRecord> = {},
): StatementImportRecord {
  return {
    id: '100',
    userId: '7',
    fileName: 'august.pdf',
    fileHash: validFileHash(),
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
    id: '1',
    userId: '7',
    fileName: 'august.pdf',
    statementDate: '2026-08-01',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    transactionCount: '2',
    ...overrides,
  };
}
