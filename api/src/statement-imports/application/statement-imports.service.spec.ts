import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import type {
  ExpenseCategoryRecord,
  ExpenseCategoryStore,
} from '../../expenses/application/expense-category-store';
import type {
  ImportedExpenseRecord,
  NewImportedExpense,
  SpaceImportedExpenseStore,
} from '../../expenses/application/imported-expense-store';
import {
  StatementImportNotFoundError,
  STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
  StatementImportValidationError,
} from './statement-import-errors';
import type {
  NewStatementImport,
  StatementImportHistoryRecord,
  StatementImportRecord,
  StatementImportStore,
} from './statement-import-store';
import { StatementImportsService } from './statement-imports.service';
import { decodeStatementImportCursor } from './statement-import-cursor';
import { computeImportFingerprint } from './import-fingerprint';
import type {
  StatementImportConfirmationContext,
  StatementImportConfirmationUnitOfWork,
} from './statement-import-confirmation';
import type {
  NewExpenseActivity,
  ExpenseActivityRecord,
  ExpenseActivityStore,
} from '../../expenses/application/expense-activity-store';
import { ApplicationError } from '../../errors/application-error';
import { UserNotFoundError } from '../../users/application/user-errors';
import type { UserRecord, UserStore } from '../../users/application/user-store';

describe('StatementImportsService', () => {
  it('requires an existing same-Space detail and preserves legacy provenance', async () => {
    const detailStore = { read: jest.fn().mockResolvedValue(null) };
    const service = new StatementImportsService(
      new StatementImportStoreFake(),
      undefined,
      undefined,
      undefined,
      detailStore,
    );
    await expect(
      service.getStatementImportDetailInSpace('7', '18'),
    ).rejects.toBeInstanceOf(StatementImportNotFoundError);
    expect(detailStore.read).toHaveBeenCalledWith('7', '18');
    const detail = {
      statementImport: { id: '18' },
      currentExpenses: { count: '0', totalAmount: '0.00' },
      rows: [],
    };
    detailStore.read.mockResolvedValue(detail);
    await expect(
      service.getStatementImportDetailInSpace('7', '18'),
    ).resolves.toBe(detail);
    expect(detail.statementImport).not.toHaveProperty('confirmation');
  });
  it('commits the Statement Import and every reviewed Expense in one unit of work', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const categories = new ExpenseCategoryStoreFake([
      categoryRecord({ id: '42' }),
    ]);
    const expenseActivities = new ExpenseActivityStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories,
      expenseActivities,
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    const committedImport = await service.commitReviewedStatementImportInSpace(
      '7',
      '7',
      statementInput(),
    );

    expect(unitOfWork.executeCalls).toBe(1);
    expect(committedImport).toEqual(statementImports.createdImport);
    expect(statementImports.createdInput).toMatchObject({
      spaceId: '7',
      importedByUserId: '7',
      fileName: 'august.pdf',
      fileHash: validFileHash(),
      statementDate: '2026-08-31',
      provider: 'Example Bank',
      accountFormat: 'visa',
    });
    expect(importedExpenses.createdInputs).toHaveLength(2);
    expect(importedExpenses.createdInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: '7',
          addedByUserId: '7',
          statementImportId: '100',
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        }),
        expect.objectContaining({
          spaceId: '7',
          addedByUserId: '7',
          statementImportId: '100',
          categoryId: '42',
          expenseDate: '2026-08-02',
          description: 'Bookstore',
          amount: '18.00',
        }),
      ]),
    );
    expect(expenseActivities.createdInputs).toEqual([
      {
        expenseId: '1',
        spaceId: '7',
        actorUserId: '7',
        type: 'created',
        occurredAt: new Date('2026-08-29T00:00:00.000Z'),
        after: {
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
      },
      {
        expenseId: '2',
        spaceId: '7',
        actorUserId: '7',
        type: 'created',
        occurredAt: new Date('2026-08-29T00:00:00.000Z'),
        after: {
          categoryId: '42',
          expenseDate: '2026-08-02',
          description: 'Bookstore',
          amount: '18.00',
        },
      },
    ]);
    expect(
      importedExpenses.createdInputs.every((input) =>
        /^[0-9a-f]{64}$/u.test(input.importFingerprint),
      ),
    ).toBe(true);
  });

  it('commits E-Wallet controls and hashes GCash references without persisting raw values', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const referenceHasher = {
      hash: jest.fn(
        ({
          spaceId,
          provider,
          reference,
        }: {
          spaceId: string;
          provider: string;
          reference: string;
        }) => `digest:${spaceId}:${provider}:${reference}`,
      ),
    };
    const service = new StatementImportsService(
      statementImports,
      unitOfWork,
      referenceHasher,
    );

    await service.commitReviewedStatementImportInSpace('7', '7', {
      ...statementInput(),
      statementType: 'e_wallet',
      statementDate: null,
      provider: 'GCash',
      accountFormat: 'E-Wallet',
      historyToDate: '2026-08-31',
      historyFromDate: '2026-08-09',
      totalDebit: '26696.92',
      expenses: [{ ...statementInput().expenses[0], reference: '123456789' }],
    });

    expect(statementImports.createdInput).toMatchObject({
      statementType: 'e_wallet',
      historyFromDate: '2026-08-09',
      totalDebit: '26696.92',
    });
    expect(importedExpenses.createdInputs[0]).toMatchObject({
      referenceHash: 'digest:7:GCash:123456789',
    });
    expect(importedExpenses.createdInputs[0]).not.toHaveProperty('reference');
    expect(referenceHasher.hash).toHaveBeenCalledWith({
      spaceId: '7',
      provider: 'GCash',
      reference: '123456789',
    });
  });

  it.each([
    { historyFromDate: null, totalDebit: '1.00' },
    { historyFromDate: '2026-08-09', totalDebit: null },
    { historyFromDate: '2026-09-01', totalDebit: '1.00' },
    { historyFromDate: '2026-08-09', totalDebit: '-1.00' },
  ])(
    'rejects invalid E-Wallet controls before persistence',
    async (controls) => {
      const statementImports = new StatementImportStoreFake();
      const importedExpenses = new ImportedExpenseStoreFake();
      const unitOfWork = new UnitOfWorkFake({
        users: userStore(),
        statementImports,
        importedExpenses,
        categories: new ExpenseCategoryStoreFake([
          categoryRecord({ id: '42' }),
        ]),
        expenseActivities: new ExpenseActivityStoreFake(),
      });
      const service = new StatementImportsService(statementImports, unitOfWork);

      await expect(
        service.commitReviewedStatementImportInSpace('7', '7', {
          ...statementInput(),
          statementType: 'e_wallet',
          statementDate: null,
          provider: 'GCash',
          accountFormat: 'E-Wallet',
          historyToDate: '2026-08-31',
          ...controls,
        }),
      ).rejects.toBeInstanceOf(StatementImportValidationError);

      expect(statementImports.createdInput).toBeUndefined();
      expect(importedExpenses.createdInputs).toEqual([]);
    },
  );

  it('uses the Space-scoped GCash reference hash for duplicate review', async () => {
    const duplicateReferenceHash = 'digest:7:GCash:123456789';
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake(
      new Map(),
      new Map([
        [
          duplicateReferenceHash,
          [
            importedExpenseRecord({
              id: '99',
              spaceId: '7',
              referenceHash: duplicateReferenceHash,
              description: 'Different visible description',
              amount: '999.99',
            }),
          ],
        ],
      ]),
    );
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork, {
      hash: () => duplicateReferenceHash,
    });

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...statementInput(),
        statementType: 'e_wallet',
        statementDate: null,
        provider: 'GCash',
        accountFormat: 'E-Wallet',
        historyToDate: '2026-08-31',
        historyFromDate: '2026-08-09',
        totalDebit: '1.00',
        expenses: [
          {
            ...statementInput().expenses[0],
            description: 'Visible values differ',
            amount: '1.00',
            reference: '123456789',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
      details: [
        expect.objectContaining({
          expenseIndexes: [0],
          committedExpenseIds: ['99'],
        }),
      ],
    });

    expect(importedExpenses.spaceReferenceQueries).toEqual([
      { spaceId: '7', referenceHash: duplicateReferenceHash },
    ]);
    expect(importedExpenses.createdInputs).toEqual([]);
  });

  it('does not treat distinct GCash references as duplicates when visible values match', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork, {
      hash: ({ reference }: { reference: string }) => `digest:${reference}`,
    });
    const visibleExpense = statementInput().expenses[0];

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...statementInput(),
        statementType: 'e_wallet',
        statementDate: null,
        provider: 'GCash',
        accountFormat: 'E-Wallet',
        historyToDate: '2026-08-31',
        historyFromDate: '2026-08-09',
        totalDebit: '9.00',
        expenses: [
          { ...visibleExpense, sourceRowId: 'row-a', reference: 'reference-a' },
          { ...visibleExpense, sourceRowId: 'row-b', reference: 'reference-b' },
        ],
      }),
    ).resolves.toBeDefined();

    expect(importedExpenses.createdInputs).toHaveLength(2);
  });

  it('commits a reviewed import into the destination Space with importer attribution', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const categories = new ExpenseCategoryStoreFake([
      categoryRecord({ id: '42', spaceId: '55' }),
    ]);
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories,
      expenseActivities: new ExpenseActivityStoreFake(),
      spaces: statementImports,
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await service.commitReviewedStatementImportInSpace(
      '7',
      '55',
      statementInput(),
    );

    expect(statementImports.spaceFileHashQuery).toBeUndefined();
    expect(statementImports.spaceLockQueries).toEqual([
      { spaceId: '55', userId: '7' },
    ]);
    expect(statementImports.createdInput).toMatchObject({
      spaceId: '55',
      importedByUserId: '7',
    });
    expect(importedExpenses.spaceFingerprintQueries).toHaveLength(2);
    expect(importedExpenses.createdInputs).toHaveLength(2);
    expect(importedExpenses.createdInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: '55',
          addedByUserId: '7',
        }),
      ]),
    );
  });

  it('allows a same-file import after probable duplicate acknowledgement', async () => {
    const statementImports = new StatementImportStoreFake([
      statementRecord({ fileHash: validFileHash() }),
    ]);
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord()]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...statementInput(),
        acknowledgeProbableDuplicates: true,
      }),
    ).resolves.toMatchObject({ fileHash: validFileHash() });

    expect(statementImports.createdInput).toBeDefined();
    expect(importedExpenses.createdInputs).toHaveLength(2);
  });

  it('rejects probable duplicates with deterministic grouped details before writing', async () => {
    const input = statementInput();
    const duplicateExpense = input.expenses[0];
    const duplicateFingerprint = computeImportFingerprint(
      input,
      duplicateExpense,
    );
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake(
      new Map([
        [
          duplicateFingerprint,
          [
            importedExpenseRecord({
              id: '12',
              importFingerprint: duplicateFingerprint,
            }),
          ],
        ],
      ]),
    );
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...input,
        expenses: [
          duplicateExpense,
          { ...duplicateExpense, sourceRowId: 'row-3' },
        ],
      }),
    ).rejects.toMatchObject({
      code: STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
      details: [
        expect.objectContaining({
          field: '/expenses/0',
          code: 'probable_duplicate',
          expenseIndexes: [0, 1],
          committedExpenseIds: ['12'],
        }),
      ],
    });

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedExpenses.createdInputs).toEqual([]);
  });

  it('acknowledges every probable duplicate and preserves every reviewed row', async () => {
    const input = statementInput();
    const duplicateExpense = input.expenses[0];
    const duplicateFingerprint = computeImportFingerprint(
      input,
      duplicateExpense,
    );
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake(
      new Map([
        [
          duplicateFingerprint,
          [
            importedExpenseRecord({
              id: '12',
              importFingerprint: duplicateFingerprint,
            }),
          ],
        ],
      ]),
    );
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...input,
        acknowledgeProbableDuplicates: true,
        expenses: [
          duplicateExpense,
          { ...duplicateExpense, sourceRowId: 'row-3' },
        ],
      }),
    ).resolves.toBeDefined();

    expect(importedExpenses.createdInputs).toHaveLength(2);
  });

  it('resolves every category before the first write and rejects missing or inactive categories', async () => {
    for (const category of [
      undefined,
      categoryRecord({ id: '43', isActive: false }),
    ]) {
      const statementImports = new StatementImportStoreFake();
      const importedExpenses = new ImportedExpenseStoreFake();
      const unitOfWork = new UnitOfWorkFake({
        users: userStore(),
        statementImports,
        importedExpenses,
        categories: new ExpenseCategoryStoreFake(
          category ? [categoryRecord(), category] : [categoryRecord()],
        ),
        expenseActivities: new ExpenseActivityStoreFake(),
      });
      const service = new StatementImportsService(statementImports, unitOfWork);

      await expect(
        service.commitReviewedStatementImportInSpace('7', '7', {
          ...statementInput(),
          expenses: [
            statementInput().expenses[0],
            { ...statementInput().expenses[1], categoryId: '43' },
          ],
        }),
      ).rejects.toEqual(
        category
          ? expect.any(CategoryInactiveError)
          : expect.any(CategoryNotFoundError),
      );

      expect(statementImports.createdInput).toBeUndefined();
      expect(importedExpenses.createdInputs).toEqual([]);
    }
  });

  it('identifies every reviewed assignment affected by an inactive Category', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([
        categoryRecord({ id: '42', isActive: false }),
        categoryRecord({ id: '43' }),
      ]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...statementInput(),
        expenses: [
          { ...statementInput().expenses[0], categoryId: '42' },
          { ...statementInput().expenses[1], categoryId: '43' },
          {
            ...statementInput().expenses[0],
            sourceRowId: 'row-3',
            categoryId: '42',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'CATEGORY_INACTIVE',
      details: [
        {
          field: '/expenses/0/categoryId',
          code: 'category_inactive',
          categoryId: '42',
          expenseIndexes: [0, 2],
        },
      ],
    });

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedExpenses.createdInputs).toEqual([]);
  });

  it('checks reviewed statement fields before any persistence call', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake(),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', {
        ...statementInput(),
        fileName: ' ',
        statementDate: '2026-02-29',
        provider: ' ',
        expenses: [
          {
            ...statementInput().expenses[0],
            description: ' ',
            amount: '4',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(StatementImportValidationError);

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedExpenses.createdInputs).toEqual([]);
  });

  it('rejects an unknown user before checking or writing statement data', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(null),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake(),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace(
        '999',
        '7',
        statementInput(),
      ),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(statementImports.createdInput).toBeUndefined();
    expect(importedExpenses.createdInputs).toEqual([]);
  });

  it('stops issuing later transaction writes when one write fails', async () => {
    const statementImports = new StatementImportStoreFake();
    const importedExpenses = new ImportedExpenseStoreFake();
    importedExpenses.failOnCreateNumber = 2;
    const unitOfWork = new UnitOfWorkFake({
      users: userStore(),
      statementImports,
      importedExpenses,
      categories: new ExpenseCategoryStoreFake([categoryRecord({ id: '42' })]),
      expenseActivities: new ExpenseActivityStoreFake(),
    });
    const service = new StatementImportsService(statementImports, unitOfWork);

    await expect(
      service.commitReviewedStatementImportInSpace('7', '7', statementInput()),
    ).rejects.toThrow('transaction write failed');

    expect(statementImports.createdInput).toBeDefined();
    expect(importedExpenses.createdInputs).toHaveLength(2);
    expect(importedExpenses.createCallCount).toBe(2);
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
    const service = new StatementImportsService(statementImports);
    const filters = {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    };

    const page = await service.listStatementImportsInSpace('7', {
      ...filters,
      pageSize: 2,
    });

    expect(page.items).toEqual(statementImports.pageResults.slice(0, 2));
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(
      decodeStatementImportCursor(page.nextCursor ?? '', filters).position,
    ).toEqual({
      confirmedAt: '2026-08-29T00:00:00.000Z',
      statementImportId: '2',
    });
    expect(statementImports.spacePageQuery).toEqual({
      spaceId: '7',
      filters,
      after: null,
      pageSize: 2,
    });

    statementImports.pageResults = [
      statementImportHistoryRecord({ id: '1', statementDate: '2026-08-02' }),
    ];
    await expect(
      service.listStatementImportsInSpace('7', {
        ...filters,
        pageSize: 1,
        cursor: page.nextCursor ?? undefined,
      }),
    ).resolves.toEqual({
      items: statementImports.pageResults,
      nextCursor: null,
    });
    expect(statementImports.spacePageQuery).toEqual({
      spaceId: '7',
      filters,
      after: {
        confirmedAt: '2026-08-29T00:00:00.000Z',
        statementImportId: '2',
      },
      pageSize: 1,
    });
  });

  it('retrieves only an owned statement import and maps absent identifiers to not found', async () => {
    const ownedImport = statementRecord({ id: '108', spaceId: '42' });
    const statementImports = new StatementImportStoreFake([
      ownedImport,
      statementRecord({ id: '109', spaceId: '7' }),
    ]);
    const service = new StatementImportsService(statementImports);

    await expect(
      service.getStatementImportInSpace('42', '108'),
    ).resolves.toEqual(ownedImport);
    await expect(
      service.getStatementImportInSpace('42', '109'),
    ).rejects.toEqual(expect.any(StatementImportNotFoundError));
    await expect(
      service.getStatementImportInSpace('42', '404'),
    ).rejects.toEqual(expect.any(StatementImportNotFoundError));
  });

  it('does not return history owned by another user', async () => {
    const statementImports = new StatementImportStoreFake(
      [],
      [
        statementImportHistoryRecord({ id: '1', spaceId: '7' }),
        statementImportHistoryRecord({ id: '2', spaceId: '8' }),
      ],
    );
    const service = new StatementImportsService(statementImports);

    await expect(service.listStatementImportsInSpace('7', {})).resolves.toEqual(
      {
        items: [statementImports.pageResults[0]],
        nextCursor: null,
      },
    );
    expect(statementImports.spacePageQuery?.spaceId).toBe('7');
  });

  it('rejects an empty cursor instead of treating it as the first page', async () => {
    const service = new StatementImportsService(new StatementImportStoreFake());

    await expect(
      service.listStatementImportsInSpace('7', { cursor: '' }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});

class UnitOfWorkFake implements StatementImportConfirmationUnitOfWork {
  executeCalls = 0;

  constructor(private readonly context: StatementImportConfirmationContext) {}

  async execute<TResult>(
    work: (context: StatementImportConfirmationContext) => Promise<TResult>,
  ): Promise<TResult> {
    this.executeCalls += 1;
    return work({
      ...this.context,
      spaces:
        this.context.spaces ??
        (this.context
          .statementImports as StatementImportConfirmationContext['spaces']),
    });
  }
}

class StatementImportStoreFake implements StatementImportStore {
  createdInput: NewStatementImport | undefined;
  createdImport: StatementImportRecord | undefined;
  spaceFileHashQuery: { spaceId: string; fileHash: string } | undefined;
  spaceLockQueries: { spaceId: string; userId: string }[] = [];
  spacePageQuery:
    | import('./statement-import-store').SpaceStatementImportHistoryPageQuery
    | undefined;
  pageResults: StatementImportHistoryRecord[];

  constructor(
    private readonly imports: StatementImportRecord[] = [],
    pageResults: StatementImportHistoryRecord[] = [],
  ) {
    this.pageResults = pageResults;
  }

  findByFileHashInSpace(
    spaceId: string,
    fileHash: string,
  ): Promise<StatementImportRecord | null> {
    this.spaceFileHashQuery = { spaceId, fileHash };
    return Promise.resolve(
      this.imports.find(
        (statementImport) =>
          statementImport.spaceId === spaceId &&
          statementImport.fileHash === fileHash,
      ) ?? null,
    );
  }

  findByIdInSpace(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null> {
    return Promise.resolve(
      this.imports.find(
        (statementImport) =>
          statementImport.spaceId === spaceId &&
          statementImport.id === statementImportId,
      ) ?? null,
    );
  }

  lockForStatementImport(spaceId: string, userId: string): Promise<void> {
    this.spaceLockQueries.push({ spaceId, userId });
    return Promise.resolve();
  }

  create(input: NewStatementImport): Promise<StatementImportRecord> {
    this.createdInput = input;
    this.createdImport = statementRecord({
      id: '100',
      spaceId: input.spaceId,
      importedByUserId: input.importedByUserId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      statementDate: input.statementDate,
      provider: input.provider,
      accountFormat: input.accountFormat,
      statementType: input.statementType,
      historyFromDate: input.historyFromDate,
      historyToDate: input.historyToDate,
      totalDebit: input.totalDebit,
      importedAt: input.importedAt,
    });
    return Promise.resolve(this.createdImport);
  }

  findPageInSpace(
    query: import('./statement-import-store').SpaceStatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]> {
    this.spacePageQuery = query;
    return Promise.resolve(
      this.pageResults.filter(
        (statementImport) => statementImport.spaceId === query.spaceId,
      ),
    );
  }
}

class ImportedExpenseStoreFake implements SpaceImportedExpenseStore {
  readonly createdInputs: NewImportedExpense[] = [];
  readonly spaceFingerprintQueries: { spaceId: string; fingerprint: string }[] =
    [];
  readonly spaceReferenceQueries: {
    spaceId: string;
    referenceHash: string;
  }[] = [];
  failOnCreateNumber: number | undefined;

  constructor(
    private readonly matchesByFingerprint: ReadonlyMap<
      string,
      ImportedExpenseRecord[]
    > = new Map(),
    private readonly matchesByReference: ReadonlyMap<
      string,
      ImportedExpenseRecord[]
    > = new Map(),
  ) {}

  get createCallCount(): number {
    return this.createdInputs.length;
  }

  findByFingerprintInSpace(
    spaceId: string,
    fingerprint: string,
  ): Promise<ImportedExpenseRecord[]> {
    this.spaceFingerprintQueries.push({ spaceId, fingerprint });
    return Promise.resolve(this.matchesByFingerprint.get(fingerprint) ?? []);
  }

  findByReferenceHashInSpace(
    spaceId: string,
    referenceHash: string,
  ): Promise<ImportedExpenseRecord[]> {
    this.spaceReferenceQueries.push({ spaceId, referenceHash });
    return Promise.resolve(
      (this.matchesByReference.get(referenceHash) ?? []).filter(
        (transaction) => transaction.spaceId === spaceId,
      ),
    );
  }

  create(input: NewImportedExpense): Promise<ImportedExpenseRecord> {
    this.createdInputs.push(input);
    if (this.createdInputs.length === this.failOnCreateNumber) {
      return Promise.reject(new Error('transaction write failed'));
    }

    return Promise.resolve({
      id: String(this.createdInputs.length),
      ...input,
      source: 'imported',
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
      revision: '1',
    });
  }

  findByIdInSpace(): Promise<ImportedExpenseRecord | null> {
    return Promise.resolve(null);
  }

  findByIdInHistoryInSpace(): Promise<ImportedExpenseRecord | null> {
    return Promise.resolve(null);
  }

  updateCategoryInSpace(): Promise<ImportedExpenseRecord | null> {
    return Promise.resolve(null);
  }

  updateInSpace(): Promise<ImportedExpenseRecord | null> {
    return Promise.resolve(null);
  }

  deleteInSpace(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class ExpenseActivityStoreFake implements ExpenseActivityStore {
  readonly createdInputs: NewExpenseActivity[] = [];

  create(input: NewExpenseActivity): Promise<ExpenseActivityRecord> {
    this.createdInputs.push(input);
    return Promise.resolve({
      id: String(this.createdInputs.length),
      ...input,
    });
  }

  findByExpenseInSpace(): Promise<ExpenseActivityRecord[]> {
    return Promise.resolve([]);
  }
}

class ExpenseCategoryStoreFake implements ExpenseCategoryStore {
  constructor(private readonly categories: ExpenseCategoryRecord[] = []) {}

  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<ExpenseCategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

function statementInput() {
  return {
    fileName: 'august.pdf',
    fileHash: validFileHash(),
    statementDate: '2026-08-31',
    statementType: 'credit_card',
    provider: 'Example Bank',
    accountFormat: 'visa',
    expenses: [
      {
        sourceRowId: 'row-1',
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
      {
        sourceRowId: 'row-2',
        categoryId: '42',
        expenseDate: '2026-08-02',
        description: 'Bookstore',
        amount: '18.00',
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

function importedExpenseRecord(
  overrides: Partial<ImportedExpenseRecord> = {},
): ImportedExpenseRecord {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: '100',
    sourceRowId: 'row-1',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',

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
  overrides: Partial<ExpenseCategoryRecord> = {},
): ExpenseCategoryRecord {
  return {
    id: '42',
    spaceId: '7',
    isActive: true,
    ...overrides,
  };
}

function statementRecord(
  overrides: Partial<StatementImportRecord> = {},
): StatementImportRecord {
  return {
    id: '100',
    spaceId: '7',
    importedByUserId: '7',
    fileName: 'august.pdf',
    fileHash: validFileHash(),
    statementDate: '2026-08-31',
    provider: 'Example Bank',
    accountFormat: 'visa',
    statementType: 'credit_card',
    historyFromDate: null,
    historyToDate: null,
    totalDebit: null,
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function statementImportHistoryRecord(
  overrides: Partial<StatementImportHistoryRecord> = {},
): StatementImportHistoryRecord {
  return {
    id: '1',
    spaceId: '7',
    importedByUserId: '7',
    fileName: 'august.pdf',
    statementDate: '2026-08-01',
    provider: 'Example Bank',
    accountFormat: 'visa',
    statementType: 'credit_card',
    historyFromDate: null,
    historyToDate: null,
    totalDebit: null,
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    expenseCount: '2',
    originalExpenseCount: null,
    ...overrides,
  };
}
