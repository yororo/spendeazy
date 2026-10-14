import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import type {
  ExpenseCategoryRecord,
  ExpenseCategoryStore,
} from './expense-category-store';
import type {
  ImportedExpenseRecord,
  SpaceImportedExpenseStore,
  UpdateImportedExpenseCategory,
  UpdateImportedExpenseInput,
} from './imported-expense-store';
import { StaleEditError } from '../../errors/application-error';
import { ImportedExpenseImmutableError } from './expense-errors';
import { ExpensesService } from './expenses.service';

describe('ExpensesService imported expenses', () => {
  it('reassigns an imported expense within its Space and clears match confidence', async () => {
    const imported = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(imported, [categoryRecord({ id: '43' })]);
    await expect(
      service.updateImportedExpenseCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '43',
      ),
    ).resolves.toMatchObject({
      categoryId: '43',
      categoryMatchConfidence: null,
    });
    expect(imported.updatedInput).toEqual({ categoryId: '43' });
  });

  it('rejects missing, cross-Space, and inactive category assignments', async () => {
    const imported = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(imported, [
      categoryRecord({ id: '43', isActive: false }),
    ]);
    await expect(
      service.updateImportedExpenseCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '404',
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.updateImportedExpenseCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '43',
      ),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.updateImportedExpenseCategoryInSpace(
        'member-2',
        'space-8',
        '1',
        null,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'EXPENSE_NOT_FOUND' }),
    );
    expect(imported.updatedInput).toBeUndefined();
  });

  it('routes category-only patches and rejects imported statement fact changes', async () => {
    const imported = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(imported, [categoryRecord({ id: '43' })]);
    await expect(
      service.updateExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
      }),
    ).resolves.toMatchObject({
      categoryId: '43',
      categoryMatchConfidence: null,
    });
    await expect(
      service.updateExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
        amount: '99.00',
      }),
    ).rejects.toBeInstanceOf(ImportedExpenseImmutableError);
  });

  it('allows an active Shared Space member to correct all supported imported fields', async () => {
    const imported = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(imported, [categoryRecord({ id: '43' })]);

    await expect(
      service.updateSharedExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
        purchaseDate: '2026-08-02',
        description: 'Dinner',
        amount: '12.99',
        expectedUpdatedAt: '2026-08-29T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: '1',
      addedByUserId: '7',
      statementImportId: '100',
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      categoryMatchConfidence: null,
    });

    expect(imported.updatedInput).toEqual({
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      expectedUpdatedAt: '2026-08-29T00:00:00.000Z',
    });
    expect(imported.updatedActorUserId).toBe('member-2');
  });

  it('allows an active Shared Space member to delete an imported Expense and rejects stale writes', async () => {
    const imported = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(imported, []);

    await expect(
      service.deleteExpenseInSpace(
        'member-2',
        'space-7',
        '1',
        '2026-08-29T00:00:00.000Z',
      ),
    ).resolves.toBeUndefined();
    expect(imported.deletedActorUserId).toBe('member-2');

    const staleImported = new ImportedExpenseStoreFake(importedRecord());
    const staleService = createService(staleImported, []);
    await expect(
      staleService.updateSharedExpenseInSpace('member-2', 'space-7', '1', {
        description: 'Stale correction',
        expectedUpdatedAt: '2026-08-30T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    await expect(
      staleService.deleteExpenseInSpace(
        'member-2',
        'space-7',
        '1',
        '2026-08-30T00:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(staleImported.updatedInput).toBeUndefined();
    expect(staleImported.deletedActorUserId).toBeUndefined();
  });
});

function createService(
  imported: SpaceImportedExpenseStore,
  categories: ExpenseCategoryRecord[],
) {
  return new ExpensesService(
    new ExpenseCategoryStoreFake(categories),
    { findByIdInSpace: jest.fn().mockResolvedValue(null) } as never,
    imported,
  );
}

class ImportedExpenseStoreFake implements SpaceImportedExpenseStore {
  updatedInput:
    | UpdateImportedExpenseCategory
    | UpdateImportedExpenseInput
    | undefined;
  updatedActorUserId: string | undefined;
  deletedActorUserId: string | undefined;
  constructor(private readonly expense: ImportedExpenseRecord) {}
  create(): Promise<ImportedExpenseRecord> {
    return Promise.reject(new Error('not used'));
  }
  findByFingerprintInSpace(): Promise<ImportedExpenseRecord[]> {
    return Promise.resolve([]);
  }
  findByReferenceHashInSpace(): Promise<ImportedExpenseRecord[]> {
    return Promise.resolve([]);
  }
  findByIdInSpace(spaceId: string, id: string) {
    return Promise.resolve(
      this.expense.spaceId === spaceId && this.expense.id === id
        ? this.expense
        : null,
    );
  }
  findByIdInHistoryInSpace(spaceId: string, id: string) {
    return Promise.resolve(
      this.expense.spaceId === spaceId && this.expense.id === id
        ? this.expense
        : null,
    );
  }
  updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseCategory,
    actorUserId: string,
  ) {
    this.updatedInput = input;
    this.updatedActorUserId = actorUserId;
    if (this.expense.spaceId !== spaceId || this.expense.id !== id)
      return Promise.resolve(null);
    return Promise.resolve({
      ...this.expense,
      categoryId: input.categoryId,
      categoryMatchConfidence: null,
    });
  }
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseInput,
    actorUserId: string,
  ) {
    this.updatedInput = input;
    this.updatedActorUserId = actorUserId;
    if (this.expense.spaceId !== spaceId || this.expense.id !== id) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      ...this.expense,
      ...input,
      categoryMatchConfidence: null,
    });
  }
  deleteInSpace(spaceId: string, id: string, actorUserId: string) {
    this.deletedActorUserId = actorUserId;
    return Promise.resolve(
      this.expense.spaceId === spaceId && this.expense.id === id,
    );
  }
}

class ExpenseCategoryStoreFake implements ExpenseCategoryStore {
  constructor(private readonly categories: ExpenseCategoryRecord[]) {}
  findBySpaceId(spaceId: string, id: string) {
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

function categoryRecord(
  overrides: Partial<ExpenseCategoryRecord> = {},
): ExpenseCategoryRecord {
  return { id: '42', spaceId: 'space-7', isActive: true, ...overrides };
}

function importedRecord(): ImportedExpenseRecord {
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
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
  };
}
