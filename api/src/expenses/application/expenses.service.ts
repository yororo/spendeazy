import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
import { normalizeAmount } from '../../normalization/amount';
import { RequestValidationError } from '../../http/request-validation-error';
import {
  isFutureManilaDate,
  MANILA_CLOCK,
  systemManilaClock,
  type ManilaClock,
} from '../../http/manila-clock';
import {
  EXPENSE_CATEGORY_STORE,
  type ExpenseCategoryStore,
} from './expense-category-store';
import { ExpenseNotFoundError } from './expense-errors';
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
  matchesExpenseDeletionReplay,
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
  sumAmountInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
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
  totalAmount: string;
}

export type CreateManualExpenseInput = Omit<
  NewManualExpense,
  'spaceId' | 'addedByUserId'
>;

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
    @Optional()
    @Inject(MANILA_CLOCK)
    private readonly clock: ManilaClock = systemManilaClock,
  ) {}

  async createManualExpenseInSpace(
    userId: string,
    spaceId: string,
    input: CreateManualExpenseInput,
  ): Promise<ManualExpenseRecord> {
    assertExpenseDateNotFuture(input.expenseDate, this.clock());
    await this.ensureActiveCategoryInSpace(spaceId, input.categoryId);

    return this.spaceExpenseStore.createInSpace({
      spaceId,
      addedByUserId: userId,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate,
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

  async getExpenseInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord> {
    const manualExpense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      id,
    );
    if (manualExpense) return manualExpense;

    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInHistoryInSpace(
        spaceId,
        id,
      );
    if (importedExpense) return importedExpense;
    throw new ExpenseNotFoundError();
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
    const currentExpense =
      await this.spaceExpenseStore.findByIdInHistoryInSpace(spaceId, id);
    if (!currentExpense) throw new ExpenseNotFoundError();
    if (currentExpense.deletedAt != null) throw new StaleEditError();
    const changes = normalizeUpdate(input);
    if (changes.expenseDate !== undefined) {
      assertExpenseDateNotFuture(changes.expenseDate, this.clock());
    }
    assertCurrentVersion(currentExpense.revision, changes.expectedRevision);

    if (
      changes.categoryId !== undefined &&
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
    const manualExpense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      id,
    );
    if (manualExpense) {
      return this.updateManualExpenseInSpace(actorUserId, spaceId, id, input);
    }

    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInHistoryInSpace(
        spaceId,
        id,
      );
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }

    return this.updateImportedExpenseInSpace(actorUserId, spaceId, id, input);
  }

  async updateSharedExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord> {
    const manualExpense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
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
      await this.spaceImportedExpenseStore.findByIdInHistoryInSpace(
        spaceId,
        id,
      );
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }
    if (importedExpense.deletedAt != null) throw new StaleEditError();

    const changes = normalizeUpdate(input);
    if (changes.expenseDate !== undefined) {
      assertExpenseDateNotFuture(changes.expenseDate, this.clock());
    }
    assertCurrentVersion(importedExpense.revision, changes.expectedRevision);

    if (
      changes.categoryId !== undefined &&
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
    expectedRevision: string,
  ): Promise<ManualExpenseRecord> {
    const currentExpense =
      await this.spaceExpenseStore.findByIdInHistoryInSpace(spaceId, id);
    if (!currentExpense) throw new ExpenseNotFoundError();
    if (currentExpense.deletedAt != null) {
      if (
        matchesExpenseDeletionReplay(
          currentExpense,
          actorUserId,
          expectedRevision,
        )
      ) {
        return currentExpense;
      }
      throw new StaleEditError();
    }
    assertCurrentVersion(currentExpense.revision, expectedRevision);

    const deleted = await this.spaceExpenseStore.deleteInSpace(
      spaceId,
      id,
      actorUserId,
      expectedRevision,
    );
    if (!deleted) {
      throw new ExpenseNotFoundError();
    }
    return this.getManualExpenseInSpaceHistory(spaceId, id);
  }

  async deleteExpenseInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    expectedRevision: string,
  ): Promise<ManualExpenseRecord | ImportedExpenseRecord> {
    const manualExpense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      id,
    );
    if (manualExpense) {
      return this.deleteManualExpenseInSpace(
        actorUserId,
        spaceId,
        id,
        expectedRevision,
      );
    }

    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInHistoryInSpace(
        spaceId,
        id,
      );
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }
    if (importedExpense.deletedAt != null) {
      if (
        matchesExpenseDeletionReplay(
          importedExpense,
          actorUserId,
          expectedRevision,
        )
      ) {
        return importedExpense;
      }
      throw new StaleEditError();
    }
    assertCurrentVersion(importedExpense.revision, expectedRevision);

    const deleted = await this.spaceImportedExpenseStore.deleteInSpace(
      spaceId,
      id,
      actorUserId,
      expectedRevision,
    );
    if (!deleted) {
      throw new ExpenseNotFoundError();
    }
    return this.getExpenseInSpace(spaceId, id);
  }

  async updateImportedExpenseCategoryInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    categoryId: string,
    expectedRevision: string,
  ): Promise<ImportedExpenseRecord> {
    const importedExpense =
      await this.spaceImportedExpenseStore.findByIdInSpace(spaceId, id);
    if (!importedExpense) {
      throw new ExpenseNotFoundError();
    }
    assertCurrentVersion(importedExpense.revision, expectedRevision);

    if (categoryId !== importedExpense.categoryId) {
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
          expectedRevision,
        },
        actorUserId,
      );
    if (!updatedExpense) {
      throw new ExpenseNotFoundError();
    }

    return updatedExpense;
  }

  private async getManualExpenseInSpaceHistory(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord> {
    const expense = await this.spaceExpenseStore.findByIdInHistoryInSpace(
      spaceId,
      id,
    );
    if (!expense) throw new ExpenseNotFoundError();
    return expense;
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
        ? decodeExpenseCursor(cursor, filters, spaceId, deletedOnly).position
        : null;
    const query: SpaceExpensePageQuery = {
      spaceId,
      filters,
      after,
      pageSize,
      ...(deletedOnly ? { deletedOnly: true } : {}),
    };
    const [records, totalCount, totalAmount] = await Promise.all([
      this.spaceExpenseStore.findPageInSpace(query),
      this.spaceExpenseStore.countInSpace({ ...query, after: null }),
      this.spaceExpenseStore.sumAmountInSpace({ ...query, after: null }),
    ]);
    return {
      ...toExpensePage(records, pageSize, filters, spaceId, deletedOnly),
      totalCount: String(totalCount),
      totalAmount,
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
    ...(input.expenseDate !== undefined
      ? { expenseDate: input.expenseDate }
      : {}),
    ...(input.description !== undefined
      ? { description: normalizeDescription(input.description) }
      : {}),
    ...(input.amount !== undefined
      ? { amount: normalizeAmount(input.amount) }
      : {}),
    expectedRevision: input.expectedRevision,
  };
}

function normalizeDescription(description: string): string {
  return description.trim();
}

function isNoOp(
  currentExpense: Pick<
    ExpenseRecord,
    'categoryId' | 'expenseDate' | 'description' | 'amount'
  >,
  changes: UpdateManualExpense,
): boolean {
  return (
    (changes.categoryId === undefined ||
      changes.categoryId === currentExpense.categoryId) &&
    (changes.expenseDate === undefined ||
      changes.expenseDate === currentExpense.expenseDate) &&
    (changes.description === undefined ||
      changes.description === currentExpense.description) &&
    (changes.amount === undefined || changes.amount === currentExpense.amount)
  );
}

function toExpensePage(
  records: ExpenseRecord[],
  pageSize: number,
  filters: ExpenseFilters,
  spaceId: string,
  deletedOnly: boolean,
): Omit<ExpensePage, 'totalCount' | 'totalAmount'> {
  const items = records.slice(0, pageSize);
  const hasNextPage = records.length > pageSize;
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor:
      hasNextPage && lastItem
        ? encodeExpenseCursor(
            deletedOnly
              ? {
                  deletedAt: lastItem.deletedAt!.toISOString(),
                  expenseId: lastItem.id,
                }
              : {
                  expenseDate: lastItem.expenseDate,
                  expenseId: lastItem.id,
                },
            filters,
            spaceId,
            deletedOnly,
          )
        : null,
  };
}

function assertCurrentVersion(
  revision: string,
  expectedRevision: string,
): void {
  if (revision !== expectedRevision) {
    throw new StaleEditError();
  }
}

function assertExpenseDateNotFuture(value: string, now: Date): void {
  if (!isFutureManilaDate(value, now)) return;

  throw new RequestValidationError([
    {
      field: '/expenseDate',
      code: 'future_date',
      message: 'Expense date cannot be after today in Asia/Manila.',
    },
  ]);
}
