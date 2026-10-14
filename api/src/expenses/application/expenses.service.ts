import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
import { normalizeAmount } from '../../normalization/amount';
import {
  EXPENSE_CATEGORY_STORE,
  type ExpenseCategoryStore,
} from './expense-category-store';
import { ExpenseNotFoundError } from './expense-errors';
import { ImportedExpenseImmutableError } from './expense-errors';
import {
  EXPENSE_ACTIVITY_STORE,
  type ExpenseActivityRecord,
  type ExpenseActivityStore,
} from './expense-activity-store';
import {
  SPACE_IMPORTED_EXPENSE_STORE,
  type ImportedExpenseRecord,
  type SpaceImportedExpenseStore,
} from './imported-expense-store';
import { decodeExpenseCursor, encodeExpenseCursor } from './expense-cursor';
import {
  SPACE_EXPENSE_STORE,
  type ManualExpenseRecord,
  type NewManualExpense,
  type SpaceExpenseStore,
  type SpaceExpensePageQuery,
  type ExpenseFilters,
  type ExpenseRecord,
  type UpdateManualExpense,
} from './expense-store';

export const DEFAULT_EXPENSE_PAGE_SIZE = 20;
export const MAX_EXPENSE_PAGE_SIZE = 100;

const SPACE_STORE_NOT_CONFIGURED =
  'Space expense persistence is not configured';

const EMPTY_SPACE_EXPENSE_STORE: SpaceExpenseStore = {
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInHistoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findPageInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  countInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  createInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  deleteInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

const EMPTY_SPACE_IMPORTED_EXPENSE_STORE: SpaceImportedExpenseStore = {
  create: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByFingerprintInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByReferenceHashInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInHistoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateCategoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  deleteInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

const EMPTY_EXPENSE_ACTIVITY_STORE: ExpenseActivityStore = {
  create: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByExpenseInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

export interface ListExpensesInput extends ExpenseFilters {
  cursor?: string;
  pageSize?: number;
}

export interface ExpensePage {
  items: ExpenseRecord[];
  nextCursor: string | null;
  totalCount: string;
}

export interface CreateManualExpenseInput extends Omit<
  NewManualExpense,
  'userId' | 'spaceId' | 'addedByUserId' | 'categoryId'
> {
  categoryId?: string | null;
}

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(EXPENSE_CATEGORY_STORE)
    private readonly categoryStore: ExpenseCategoryStore,
    @Inject(SPACE_EXPENSE_STORE)
    private readonly spaceExpenseStore: SpaceExpenseStore = EMPTY_SPACE_EXPENSE_STORE,
    @Inject(SPACE_IMPORTED_EXPENSE_STORE)
    private readonly spaceImportedExpenseStore: SpaceImportedExpenseStore = EMPTY_SPACE_IMPORTED_EXPENSE_STORE,
    @Inject(EXPENSE_ACTIVITY_STORE)
    private readonly expenseActivityStore: ExpenseActivityStore = EMPTY_EXPENSE_ACTIVITY_STORE,
  ) {}

  async createManualExpenseInSpace(
    userId: string,
    spaceId: string,
    input: CreateManualExpenseInput,
  ): Promise<ManualExpenseRecord> {
    const categoryId = input.categoryId ?? null;
    if (categoryId !== null) {
      await this.ensureActiveCategoryInSpace(spaceId, categoryId);
    }

    return this.spaceExpenseStore.createInSpace({
      spaceId,
      addedByUserId: userId,
      categoryId,
      purchaseDate: input.purchaseDate,
      description: normalizeDescription(input.description),
      amount: normalizeAmount(input.amount),
    });
  }

  async getManualExpenseInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord> {
    const expense = await this.spaceExpenseStore.findByIdInSpace(spaceId, id);
    if (!expense) {
      throw new ExpenseNotFoundError();
    }

    return expense;
  }

  async listExpenseActivityInSpace(
    spaceId: string,
    expenseId: string,
  ): Promise<ExpenseActivityRecord[]> {
    const expense = await this.findExpenseInHistoryInSpace(spaceId, expenseId);
    if (!expense) {
      throw new ExpenseNotFoundError();
    }

    return this.expenseActivityStore.findByExpenseInSpace(spaceId, expenseId);
  }

  async listExpensesInSpace(
    spaceId: string,
    input: ListExpensesInput,
  ): Promise<ExpensePage> {
    return this.listExpensesPageInSpace(spaceId, input, false);
  }

  async listDeletedExpensesInSpace(
    spaceId: string,
    input: ListExpensesInput,
  ): Promise<ExpensePage> {
    return this.listExpensesPageInSpace(spaceId, input, true);
  }

  async updateManualExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
  ): Promise<ManualExpenseRecord> {
    const currentExpense = await this.getManualExpenseInSpace(spaceId, id);
    const changes = normalizeUpdate(input);
    assertCurrentVersion(currentExpense.updatedAt, changes.expectedUpdatedAt);

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== null &&
      changes.categoryId !== currentExpense.categoryId
    ) {
      await this.ensureActiveCategoryInSpace(spaceId, changes.categoryId);
    }

    if (isNoOp(currentExpense, changes)) {
      return currentExpense;
    }

    const updatedExpense = await this.spaceExpenseStore.updateInSpace(
      spaceId,
      id,
      changes,
      actorUserId,
    );
    if (!updatedExpense) {
      throw new ExpenseNotFoundError();
    }

    return updatedExpense;
  }

  async updateExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord> {
    const manualExpense = await this.spaceExpenseStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualExpense) {
      return this.updateManualExpenseInSpace(actorUserId, spaceId, id, input);
    }

    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInSpace(spaceId, id);
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }

    if (
      input.categoryId === undefined ||
      Object.keys(input).some(
        (key) => key !== 'categoryId' && key !== 'expectedUpdatedAt',
      )
    ) {
      throw new ImportedExpenseImmutableError();
    }

    return this.updateImportedExpenseCategoryInSpace(
      actorUserId,
      spaceId,
      id,
      input.categoryId,
      input.expectedUpdatedAt,
    );
  }

  async updateSharedExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord> {
    const manualExpense = await this.spaceExpenseStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualExpense) {
      return this.updateManualExpenseInSpace(actorUserId, spaceId, id, input);
    }

    return this.updateImportedExpenseInSpace(actorUserId, spaceId, id, input);
  }

  async updateImportedExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
  ): Promise<ImportedExpenseRecord> {
    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInSpace(spaceId, id);
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }

    const changes = normalizeUpdate(input);
    assertCurrentVersion(importedExpense.updatedAt, changes.expectedUpdatedAt);

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== null &&
      changes.categoryId !== importedExpense.categoryId
    ) {
      await this.ensureActiveCategoryInSpace(spaceId, changes.categoryId);
    }

    if (isNoOp(importedExpense, changes)) {
      return importedExpense;
    }

    const updatedExpense = await this.spaceImportedExpenseStore.updateInSpace(
      spaceId,
      id,
      changes,
      actorUserId,
    );
    if (!updatedExpense) {
      throw new ExpenseNotFoundError();
    }

    return updatedExpense;
  }

  async deleteManualExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const currentExpense = await this.getManualExpenseInSpace(spaceId, id);
    assertCurrentVersion(currentExpense.updatedAt, expectedUpdatedAt);

    const deleted = await this.spaceExpenseStore.deleteInSpace(
      spaceId,
      id,
      actorUserId,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new ExpenseNotFoundError();
    }
  }

  async deleteExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const manualExpense = await this.spaceExpenseStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualExpense) {
      return this.deleteManualExpenseInSpace(
        actorUserId,
        spaceId,
        id,
        expectedUpdatedAt,
      );
    }

    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInSpace(spaceId, id);
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }
    assertCurrentVersion(importedExpense.updatedAt, expectedUpdatedAt);

    const deleted = await this.spaceImportedExpenseStore.deleteInSpace(
      spaceId,
      id,
      actorUserId,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new ExpenseNotFoundError();
    }
  }

  async updateImportedExpenseCategoryInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    categoryId: string | null,
    expectedUpdatedAt?: string,
  ): Promise<ImportedExpenseRecord> {
    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInSpace(spaceId, id);
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }
    assertCurrentVersion(importedExpense.updatedAt, expectedUpdatedAt);

    if (categoryId !== null && categoryId !== importedExpense.categoryId) {
      await this.ensureActiveCategoryInSpace(spaceId, categoryId);
    }

    if (categoryId === importedExpense.categoryId) {
      return importedExpense;
    }

    const updatedExpense =
      await this.spaceImportedExpenseStore.updateCategoryInSpace(
        spaceId,
        id,
        {
          categoryId,
          ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
        },
        actorUserId,
      );
    if (!updatedExpense) {
      throw new ExpenseNotFoundError();
    }

    return updatedExpense;
  }

  private async ensureActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<void> {
    if (!this.categoryStore.findBySpaceId) {
      throw new Error('Space expense persistence is not configured');
    }

    const category = await this.categoryStore.findBySpaceId(
      spaceId,
      categoryId,
    );
    if (!category) {
      throw new CategoryNotFoundError();
    }
    if (!category.isActive) {
      throw new CategoryInactiveError();
    }
  }

  private async listExpensesPageInSpace(
    spaceId: string,
    input: ListExpensesInput,
    deletedOnly: boolean,
  ): Promise<ExpensePage> {
    const cursor = input.cursor;
    const pageSize = input.pageSize ?? DEFAULT_EXPENSE_PAGE_SIZE;
    const filters = { ...input };
    delete filters.cursor;
    delete filters.pageSize;
    const after =
      cursor !== undefined
        ? decodeExpenseCursor(cursor, filters).position
        : null;
    const query: SpaceExpensePageQuery = {
      spaceId,
      filters,
      after,
      pageSize,
      ...(deletedOnly ? { deletedOnly: true } : {}),
    };
    const [records, totalCount] = await Promise.all([
      this.spaceExpenseStore.findPageInSpace(query),
      this.spaceExpenseStore.countInSpace({ ...query, after: null }),
    ]);
    return {
      ...toExpensePage(records, pageSize, filters),
      totalCount: String(totalCount),
    };
  }

  private async findExpenseInHistoryInSpace(
    spaceId: string,
    expenseId: string,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord | null> {
    const manualExpense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      expenseId,
    );
    if (manualExpense) {
      return manualExpense;
    }

    return this.spaceImportedExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      expenseId,
    );
  }
}

function normalizeUpdate(input: UpdateManualExpense): UpdateManualExpense {
  return {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.purchaseDate !== undefined
      ? { purchaseDate: input.purchaseDate }
      : {}),
    ...(input.description !== undefined
      ? { description: normalizeDescription(input.description) }
      : {}),
    ...(input.amount !== undefined
      ? { amount: normalizeAmount(input.amount) }
      : {}),
    ...(input.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.expectedUpdatedAt }),
  };
}

function normalizeDescription(description: string): string {
  return description.trim();
}

function isNoOp(
  currentExpense: Pick<
    ExpenseRecord,
    'categoryId' | 'purchaseDate' | 'description' | 'amount'
  >,
  changes: UpdateManualExpense,
): boolean {
  return (
    (changes.categoryId === undefined ||
      changes.categoryId === currentExpense.categoryId) &&
    (changes.purchaseDate === undefined ||
      changes.purchaseDate === currentExpense.purchaseDate) &&
    (changes.description === undefined ||
      changes.description === currentExpense.description) &&
    (changes.amount === undefined || changes.amount === currentExpense.amount)
  );
}

function toExpensePage(
  records: ExpenseRecord[],
  pageSize: number,
  filters: ExpenseFilters,
): Omit<ExpensePage, 'totalCount'> {
  const items = records.slice(0, pageSize);
  const hasNextPage = records.length > pageSize;
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor:
      hasNextPage && lastItem
        ? encodeExpenseCursor(
            {
              purchaseDate: lastItem.purchaseDate,
              expenseId: lastItem.id,
            },
            filters,
          )
        : null,
  };
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string | undefined,
): void {
  if (expectedUpdatedAt === undefined) return;

  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
