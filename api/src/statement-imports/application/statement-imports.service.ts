import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  STATEMENT_IMPORT_DETAIL_STORE,
  type StatementImportDetailStore,
} from './statement-import-detail-store';
import { assertActiveCategory } from '../../categories/application/active-category';
import { isValidDomainDate } from '../../http/domain-date';
import {
  isFutureManilaDate,
  MANILA_CLOCK,
  systemManilaClock,
  type ManilaClock,
} from '../../http/manila-clock';
import {
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';
import {
  STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK,
  type StatementImportConfirmationContext,
  type StatementImportConfirmationUnitOfWork,
} from './statement-import-confirmation';
import { normalizeAmount } from '../../normalization/amount';
import { toExpenseActivitySnapshot } from '../../expenses/application/expense-activity-store';
import { computeImportFingerprint } from './import-fingerprint';
import { findProbableDuplicateGroups } from './probable-duplicates';
import {
  StatementImportFileHashInvalidError,
  StatementImportNotFoundError,
  StatementImportProbableDuplicatesError,
  StatementImportCategoryEligibilityError,
  StatementImportValidationError,
  type CategoryEligibilityConflict,
} from './statement-import-errors';
import {
  STATEMENT_IMPORT_STORE,
  type StatementImportRecord,
  type SpaceStatementImportHistoryPageQuery,
  type StatementImportStore,
} from './statement-import-store';
import {
  decodeStatementImportCursor,
  encodeStatementImportCursor,
} from './statement-import-cursor';
import type {
  StatementImportHistoryFilters,
  StatementImportHistoryRecord,
} from './statement-import-store';
import type { ErrorDetail } from '../../errors/application-error';
import { UserNotFoundError } from '../../users/application/user-errors';
import {
  GCASH_REFERENCE_HASHER,
  type GCashReferenceHasher,
} from './gcash-reference-hasher';
import {
  isEWalletProvider,
  isStatementType,
  type StatementType,
} from './statement-type';

export const DEFAULT_STATEMENT_IMPORT_PAGE_SIZE = 20;
export const MAX_STATEMENT_IMPORT_PAGE_SIZE = 100;

export interface ReviewedExpenseInput {
  sourceRowId: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
  reference?: string | null;
}

export interface CommitReviewedStatementImportInput {
  fileName: string;
  fileHash: string;
  statementDate?: string;
  statementType: StatementType;
  provider: string;
  accountFormat?: string | null;
  historyFromDate?: string | null;
  historyToDate?: string | null;
  totalDebit?: string | null;
  expenses: ReviewedExpenseInput[];
  acknowledgeProbableDuplicates?: boolean;
}

export interface ListStatementImportsInput extends StatementImportHistoryFilters {
  cursor?: string;
  pageSize?: number;
}

export interface StatementImportPage {
  items: StatementImportHistoryRecord[];
  nextCursor: string | null;
}

export { computeImportFingerprint } from './import-fingerprint';

@Injectable()
export class StatementImportsService {
  constructor(
    @Inject(STATEMENT_IMPORT_STORE)
    private readonly statementImportStore: StatementImportStore,
    @Optional()
    @Inject(STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK)
    private readonly unitOfWork?: StatementImportConfirmationUnitOfWork,
    @Optional()
    @Inject(GCASH_REFERENCE_HASHER)
    private readonly gcashReferenceHasher?: GCashReferenceHasher,
    @Optional()
    @Inject(MANILA_CLOCK)
    private readonly clock: ManilaClock = systemManilaClock,
    @Optional()
    @Inject(STATEMENT_IMPORT_DETAIL_STORE)
    private readonly detailStore?: StatementImportDetailStore,
  ) {}

  commitReviewedStatementImportInSpace(
    userId: string,
    spaceId: string,
    input: CommitReviewedStatementImportInput,
  ): Promise<StatementImportRecord> {
    if (!this.unitOfWork) {
      return Promise.reject(
        new Error(
          'Statement import confirmation persistence is not configured',
        ),
      );
    }

    return this.unitOfWork.execute((context) =>
      this.commitWithinTransaction(context, userId, spaceId, input),
    );
  }

  async getStatementImportInSpace(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord> {
    const statementImport = await this.statementImportStore.findByIdInSpace(
      spaceId,
      statementImportId,
    );
    if (!statementImport) {
      throw new StatementImportNotFoundError();
    }

    return statementImport;
  }

  async getStatementImportDetailInSpace(
    spaceId: string,
    statementImportId: string,
  ) {
    if (!this.detailStore)
      throw new Error('Statement import detail persistence is not configured');
    const detail = await this.detailStore.read(spaceId, statementImportId);
    if (!detail) throw new StatementImportNotFoundError();
    return detail;
  }

  async listStatementImportsInSpace(
    spaceId: string,
    input: ListStatementImportsInput,
  ): Promise<StatementImportPage> {
    const {
      cursor,
      pageSize = DEFAULT_STATEMENT_IMPORT_PAGE_SIZE,
      ...filters
    } = input;
    const after =
      cursor !== undefined
        ? decodeStatementImportCursor(cursor, filters).position
        : null;
    const query: SpaceStatementImportHistoryPageQuery = {
      spaceId,
      filters,
      after,
      pageSize,
    };
    const records = await this.statementImportStore.findPageInSpace(query);
    const items = records.slice(0, pageSize);
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor:
        records.length > pageSize && lastItem
          ? encodeStatementImportCursor(
              {
                confirmedAt: lastItem.importedAt.toISOString(),
                statementImportId: lastItem.id,
              },
              filters,
            )
          : null,
    };
  }

  private async commitWithinTransaction(
    context: StatementImportConfirmationContext,
    userId: string,
    spaceId: string,
    input: CommitReviewedStatementImportInput,
  ): Promise<StatementImportRecord> {
    validateReviewedStatementInput(input, this.clock());

    const user = await context.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    if (!context.spaces) {
      throw new Error('Space statement import persistence is not configured');
    }
    await context.spaces.lockForStatementImport(spaceId, userId);

    await ensureCategoriesAreActive(context, spaceId, input.expenses);
    const preparedExpenses = input.expenses.map((expense) => {
      const referenceHash =
        expense.reference == null
          ? null
          : this.hashGcashReference(spaceId, input.provider, expense.reference);
      const importFingerprint = computeImportFingerprint(input, expense);

      return {
        sourceRowId: expense.sourceRowId,
        categoryId: expense.categoryId,
        expenseDate: expense.expenseDate,
        description: expense.description.trim(),
        amount: normalizeAmount(expense.amount),
        importFingerprint,
        referenceHash,
        duplicateKey: referenceHash ?? importFingerprint,
      };
    });

    const probableDuplicateGroups = await findProbableDuplicates(
      context,
      spaceId,
      preparedExpenses,
    );
    if (
      probableDuplicateGroups.length > 0 &&
      !input.acknowledgeProbableDuplicates
    ) {
      throw new StatementImportProbableDuplicatesError(probableDuplicateGroups);
    }

    const statementImport = await context.statementImports.create({
      importedByUserId: userId,
      spaceId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      statementDate:
        input.statementType === 'credit_card' ? input.statementDate! : null,
      provider: input.provider,
      accountFormat: input.accountFormat ?? null,
      statementType: input.statementType,
      historyFromDate: input.historyFromDate ?? null,
      historyToDate: input.historyToDate ?? null,
      totalDebit:
        input.totalDebit == null ? null : normalizeAmount(input.totalDebit),
      importedAt: new Date(),
    });

    for (const expense of preparedExpenses) {
      const createdExpense = await context.importedExpenses.create({
        spaceId,
        addedByUserId: userId,
        categoryId: expense.categoryId,
        statementImportId: statementImport.id,
        sourceRowId: expense.sourceRowId,
        expenseDate: expense.expenseDate,
        description: expense.description,
        amount: expense.amount,
        importFingerprint: expense.importFingerprint,
        referenceHash: expense.referenceHash,
      });
      await context.expenseActivities.create({
        expenseId: createdExpense.id,
        spaceId,
        actorUserId: userId,
        type: 'created',
        occurredAt: createdExpense.createdAt,
        after: toExpenseActivitySnapshot(createdExpense),
      });
    }

    return statementImport;
  }

  private hashGcashReference(
    spaceId: string,
    provider: string,
    reference: string,
  ): string {
    if (!this.gcashReferenceHasher) {
      throw new Error('GCASH_REFERENCE_HASH_KEY is required for GCash imports');
    }

    return this.gcashReferenceHasher.hash({ spaceId, provider, reference });
  }
}

async function findProbableDuplicates(
  context: StatementImportConfirmationContext,
  spaceId: string,
  preparedExpenses: readonly {
    importFingerprint: string;
    referenceHash: string | null;
    duplicateKey: string;
  }[],
) {
  const duplicateKeys = [
    ...new Set(preparedExpenses.map((expense) => expense.duplicateKey)),
  ];
  const committedMatchesByDuplicateKey = new Map<string, { id: string }[]>();

  for (const duplicateKey of duplicateKeys) {
    const expense = preparedExpenses.find(
      (candidate) => candidate.duplicateKey === duplicateKey,
    );
    const committedMatches = expense?.referenceHash
      ? await context.importedExpenses.findByReferenceHashInSpace(
          spaceId,
          expense.referenceHash,
        )
      : await context.importedExpenses.findByFingerprintInSpace(
          spaceId,
          duplicateKey,
        );
    committedMatchesByDuplicateKey.set(duplicateKey, committedMatches);
  }

  return findProbableDuplicateGroups(
    preparedExpenses.map((expense, expenseIndex) => ({
      expenseIndex,
      fingerprint: expense.duplicateKey,
    })),
    committedMatchesByDuplicateKey,
  );
}

async function ensureCategoriesAreActive(
  context: StatementImportConfirmationContext,
  spaceId: string,
  expenses: ReviewedExpenseInput[],
): Promise<void> {
  const expenseIndexesByCategory = new Map<string, number[]>();
  expenses.forEach((expense, expenseIndex) => {
    const indexes = expenseIndexesByCategory.get(expense.categoryId);
    if (indexes) {
      indexes.push(expenseIndex);
      return;
    }

    expenseIndexesByCategory.set(expense.categoryId, [expenseIndex]);
  });

  const inactiveCategories: CategoryEligibilityConflict[] = [];

  for (const [categoryId, expenseIndexes] of expenseIndexesByCategory) {
    const category = await context.categories.findBySpaceId(
      spaceId,
      categoryId,
    );
    if (!category) {
      assertActiveCategory(category);
    }
    if (!category.isActive) {
      inactiveCategories.push({ categoryId, expenseIndexes });
    }
  }

  if (inactiveCategories.length > 0) {
    throw new StatementImportCategoryEligibilityError(inactiveCategories);
  }
}

function validateReviewedStatementInput(
  input: CommitReviewedStatementImportInput,
  now: Date,
): void {
  if (!/^[0-9a-f]{64}$/u.test(input.fileHash)) {
    throw new StatementImportFileHashInvalidError();
  }

  const details: ErrorDetail[] = [];
  addStringDetail(details, '/fileName', input.fileName, 255);
  if (!isStatementType(input.statementType)) {
    details.push({
      field: '/statementType',
      code: 'invalid_format',
      message: 'Statement type must be credit_card or e_wallet',
    });
  }
  addStringDetail(details, '/provider', input.provider, 100);
  if (input.accountFormat != null) {
    addStringDetail(details, '/accountFormat', input.accountFormat, 100);
  }
  const isEWallet = input.statementType === 'e_wallet';
  if (isEWallet) {
    if (input.statementDate != null) {
      details.push({
        field: '/statementDate',
        code: 'not_allowed',
        message: 'Statement date is only valid for Credit Card imports',
      });
    }
    addDateDetail(details, '/historyFromDate', input.historyFromDate);
    if (
      typeof input.historyToDate !== 'string' ||
      !isValidDomainDate(input.historyToDate)
    ) {
      details.push({
        field: '/historyToDate',
        code: 'invalid_format',
        message: 'Date must be a valid calendar date in YYYY-MM-DD format',
      });
    }
    if (
      typeof input.historyFromDate === 'string' &&
      typeof input.historyToDate === 'string' &&
      isValidDomainDate(input.historyFromDate) &&
      isValidDomainDate(input.historyToDate) &&
      input.historyFromDate > input.historyToDate
    ) {
      details.push({
        field: '/historyFromDate',
        code: 'invalid_bounds',
        message: 'History start must be on or before its end',
      });
    }
    if (
      typeof input.totalDebit !== 'string' ||
      !/^\d{1,13}\.\d{2}$/u.test(input.totalDebit)
    ) {
      details.push({
        field: '/totalDebit',
        code: 'invalid_format',
        message: 'Total Debit must be a non-negative two-decimal string',
      });
    }
  } else {
    addDateDetail(details, '/statementDate', input.statementDate);
    if (input.historyFromDate != null || input.historyToDate != null) {
      details.push({
        field: '/historyFromDate',
        code: 'not_allowed',
        message: 'History dates are only valid for E-Wallet imports',
      });
    }
    if (input.totalDebit != null) {
      details.push({
        field: '/totalDebit',
        code: 'not_allowed',
        message: 'Total Debit is only valid for E-Wallet imports',
      });
    }
  }
  if (
    input.acknowledgeProbableDuplicates !== undefined &&
    typeof input.acknowledgeProbableDuplicates !== 'boolean'
  ) {
    details.push({
      field: '/acknowledgeProbableDuplicates',
      code: 'invalid_type',
      message: 'Probable-duplicate acknowledgement must be a boolean',
    });
  }

  if (!Array.isArray(input.expenses)) {
    details.push({
      field: '/expenses',
      code: 'invalid_format',
      message: 'Expenses must be an array',
    });
  } else {
    const seenSourceRowIds = new Set<string>();
    input.expenses.forEach((expense, index) => {
      const fieldPrefix = `/expenses/${index}`;
      if (expense === null || typeof expense !== 'object') {
        details.push({
          field: fieldPrefix,
          code: 'invalid_format',
          message: 'Expense must be an object',
        });
        return;
      }
      if (
        typeof expense.sourceRowId !== 'string' ||
        expense.sourceRowId.trim().length === 0
      ) {
        details.push({
          field: `${fieldPrefix}/sourceRowId`,
          code: 'invalid_format',
          message: 'A non-empty source-row identifier is required',
        });
      } else if (seenSourceRowIds.has(expense.sourceRowId)) {
        details.push({
          field: `${fieldPrefix}/sourceRowId`,
          code: 'duplicate',
          message: 'Source-row identifiers must be unique within an import',
        });
      } else {
        seenSourceRowIds.add(expense.sourceRowId);
      }
      if (
        typeof expense.categoryId !== 'string' ||
        !POSITIVE_INTEGER_ID_PATTERN.test(expense.categoryId)
      ) {
        details.push({
          field: `${fieldPrefix}/categoryId`,
          code: 'invalid_format',
          message: 'A positive Category ID string is required',
        });
      }
      addDateDetail(details, `${fieldPrefix}/expenseDate`, expense.expenseDate);
      if (
        typeof expense.expenseDate === 'string' &&
        isValidDomainDate(expense.expenseDate) &&
        isFutureManilaDate(expense.expenseDate, now)
      ) {
        details.push({
          field: `${fieldPrefix}/expenseDate`,
          code: 'future_date',
          message: 'Expense date cannot be after today in Asia/Manila',
        });
      }
      addStringDetail(
        details,
        `${fieldPrefix}/description`,
        expense.description,
        500,
      );
      if (
        typeof expense.amount !== 'string' ||
        !POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.test(expense.amount)
      ) {
        details.push({
          field: `${fieldPrefix}/amount`,
          code: 'invalid_format',
          message: 'Amount must be a positive two-decimal string',
        });
      }
      if (expense.reference != null) {
        if (
          !isEWallet ||
          !isEWalletProvider(input.provider) ||
          typeof expense.reference !== 'string' ||
          expense.reference.trim().length === 0 ||
          Array.from(expense.reference).length > 100
        ) {
          details.push({
            field: `${fieldPrefix}/reference`,
            code: 'invalid_format',
            message:
              'Reference is only supported as a non-empty GCash E-Wallet reference within its length limit',
          });
        }
      }
    });
  }

  if (details.length > 0) {
    throw new StatementImportValidationError(details);
  }
}

function addStringDetail(
  details: ErrorDetail[],
  field: string,
  value: unknown,
  maximumLength: number,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Array.from(value).length > maximumLength
  ) {
    details.push({
      field,
      code: 'invalid_format',
      message: 'Value must be a non-empty string within its length limit',
    });
  }
}

function addDateDetail(
  details: ErrorDetail[],
  field: string,
  value: unknown,
): void {
  if (!isValidDomainDate(value)) {
    details.push({
      field,
      code: 'invalid_format',
      message: 'Date must be a valid calendar date in YYYY-MM-DD format',
    });
  }
}
