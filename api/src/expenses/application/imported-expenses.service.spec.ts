import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
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
import type { SpaceExpenseStore } from './expense-store';
import { ExpensesService } from './expenses.service';

describe('ExpensesService imported Expenses', () => {
  it('edits imported financial fields while preserving immutable provenance', async () => {
    const store = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(store, [categoryRecord({ id: '43' })]);

    await expect(
      service.updateSharedExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
        expenseDate: '2026-08-02',
        description: 'Dinner',
        amount: '12.99',
        expectedRevision: '1',
      }),
    ).resolves.toMatchObject({
      id: '1',
      addedByUserId: '7',
      statementImportId: '100',
      categoryId: '43',
      expenseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      revision: '2',
    });
    expect(store.updatedActorUserId).toBe('member-2');
    expect(store.updatedInput).toMatchObject({ expectedRevision: '1' });
  });

  it('requires an active Category from the same Space for reassignment', async () => {
    const store = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(store, [
      categoryRecord({ id: '43', isActive: false }),
    ]);

    await expect(
      service.updateExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '404',
        expectedRevision: '1',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.updateExpenseInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
        expectedRevision: '1',
      }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.updateExpenseInSpace('member-2', 'space-8', '1', {
        description: 'Missing',
        expectedRevision: '1',
      }),
    ).rejects.toMatchObject({ code: 'EXPENSE_NOT_FOUND' });
    expect(store.updatedInput).toBeUndefined();
  });

  it('rejects stale edits and deletes before writing', async () => {
    const store = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(store, []);

    await expect(
      service.updateExpenseInSpace('member-2', 'space-7', '1', {
        description: 'Stale correction',
        expectedRevision: '2',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    await expect(
      service.deleteExpenseInSpace('member-2', 'space-7', '1', '2'),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(store.updatedInput).toBeUndefined();
    expect(store.deletedActorUserId).toBeUndefined();
  });

  it('passes the deleting actor and revision to the store', async () => {
    const store = new ImportedExpenseStoreFake(importedRecord());
    const service = createService(store, []);

    const deleted = await service.deleteExpenseInSpace(
      'member-2',
      'space-7',
      '1',
      '1',
    );
    expect(deleted.revision).toBe('2');
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(store.deletedActorUserId).toBe('member-2');
  });
});

function createService(
  imported: SpaceImportedExpenseStore,
  categories: ExpenseCategoryRecord[],
): ExpensesService {
  const categoryStore: ExpenseCategoryStore = {
    findBySpaceId: (spaceId, id) =>
      Promise.resolve(
        categories.find(
          (category) => category.spaceId === spaceId && category.id === id,
        ) ?? null,
      ),
  };
  const manualStore = {
    findByIdInSpace: () => Promise.resolve(null),
    findByIdInHistoryInSpace: () => Promise.resolve(null),
  } as unknown as SpaceExpenseStore;
  return new ExpensesService(categoryStore, manualStore, imported);
}

class ImportedExpenseStoreFake implements SpaceImportedExpenseStore {
  updatedInput:
    UpdateImportedExpenseCategory | UpdateImportedExpenseInput | undefined;
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
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null> {
    return Promise.resolve(
      this.expense.spaceId === spaceId &&
        this.expense.id === id &&
        this.expense.deletedAt == null
        ? this.expense
        : null,
    );
  }
  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null> {
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
  ): Promise<ImportedExpenseRecord | null> {
    return this.updateInSpace(spaceId, id, input, actorUserId);
  }
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseInput,
    actorUserId: string,
  ): Promise<ImportedExpenseRecord | null> {
    this.updatedInput = input;
    this.updatedActorUserId = actorUserId;
    if (this.expense.spaceId !== spaceId || this.expense.id !== id)
      return Promise.resolve(null);
    Object.assign(this.expense, input, {
      revision: String(Number(this.expense.revision) + 1),
    });
    delete (
      this.expense as Partial<ImportedExpenseRecord> & {
        expectedRevision?: string;
      }
    ).expectedRevision;
    return Promise.resolve(this.expense);
  }
  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedRevision: string,
  ): Promise<boolean> {
    this.deletedActorUserId = actorUserId;
    if (
      this.expense.spaceId !== spaceId ||
      this.expense.id !== id ||
      this.expense.revision !== expectedRevision
    )
      return Promise.resolve(false);
    this.expense.deletedAt = new Date('2026-09-01T00:00:00.000Z');
    this.expense.revision = String(Number(this.expense.revision) + 1);
    return Promise.resolve(true);
  }
}

function categoryRecord(
  overrides: Partial<ExpenseCategoryRecord> = {},
): ExpenseCategoryRecord {
  return { id: '42', spaceId: 'space-7', isActive: true, ...overrides };
}

function importedRecord(): ImportedExpenseRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: '100',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    importFingerprint: 'a'.repeat(64),
    source: 'imported',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: '1',
    deletedAt: null,
  };
}
