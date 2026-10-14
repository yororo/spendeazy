import { Inject, Injectable, Optional } from '@nestjs/common';
import { assertActiveCategory } from '../../categories/application/active-category';
import { isValidDomainDate } from '../../http/domain-date';
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
import { computeImportFingerprint } from './import-fingerprint';
import { findProbableDuplicateGroups } from './probable-duplicates';
import {
  StatementImportFileAlreadyExistsError,
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

export interface ReviewedStatementExpenseInput {
  categoryId?: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
  categoryMatchConfidence?: string | null;
  reference?: string | null;
}

export interface CommitReviewedStatementImportInput {
  fileName: string;
  fileHash: string;
  statementDate: string;
  statementType: StatementType;
  bank: string;
  cardType?: string | null;
  transactionHistoryStartDate?: string | null;
  totalDebit?: string | null;
  expenses: ReviewedStatementExpenseInput[];
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
      this.commitWithinExpense(context, userId, spaceId, input),
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
                statementDate: lastItem.statementDate,
                statementImportId: lastItem.id,
              },
              filters,
            )
          : null,
    };
  }

  private async commitWithinExpense(
    context: StatementImportConfirmationContext,
    userId: string,
    spaceId: string,
    input: CommitReviewedStatementImportInput,
  ): Promise<StatementImportRecord> {
    validateReviewedStatementInput(input);

    const user = await context.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    if (!context.spaces) {
      throw new Error('Space statement import persistence is not configured');
    }
    await context.spaces.lockForStatementImport(spaceId, userId);

    const existingImport = await context.statementImports.findByFileHashInSpace(
      spaceId,
      input.fileHash,
    );
    if (existingImport) {
      throw new StatementImportFileAlreadyExistsError();
    }

    await ensureCategoriesAreActive(context, spaceId, input.expenses);
    const preparedExpenses = input.expenses.map((expense) => {
      const referenceHash =
        expense.reference == null
          ? null
          : this.hashGcashReference(spaceId, input.bank, expense.reference);
      const importFingerprint = computeImportFingerprint(input, expense);

      return {
        categoryId: expense.categoryId ?? null,
        purchaseDate: expense.purchaseDate,
        description: expense.description.trim(),
        amount: normalizeAmount(expense.amount),
        categoryMatchConfidence: expense.categoryMatchConfidence ?? null,
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
      statementDate: input.statementDate,
      bank: input.bank,
      cardType: input.cardType ?? null,
      statementType: input.statementType,
      transactionHistoryStartDate: input.transactionHistoryStartDate ?? null,
      totalDebit:
        input.totalDebit == null ? null : normalizeAmount(input.totalDebit),
      importedAt: new Date(),
    });

    for (const expense of preparedExpenses) {
      const createdExpense = await context.importedExpenses.create({
        spaceId,
        addedByUserId: userId,
        categoryId: expense.categoryId ?? null,
        statementImportId: statementImport.id,
        purchaseDate: expense.purchaseDate,
        description: expense.description,
        amount: expense.amount,
        categoryMatchConfidence: expense.categoryMatchConfidence,
        importFingerprint: expense.importFingerprint,
        referenceHash: expense.referenceHash,
      });
      await context.expenseActivities.create({
        expenseId: createdExpense.id,
        spaceId,
        actorUserId: userId,
        type: 'created',
        occurredAt: createdExpense.createdAt,
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
    ...new Set(
      preparedExpenses.map((expense) => expense.duplicateKey),
    ),
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
  expenses: ReviewedStatementExpenseInput[],
): Promise<void> {
  const expenseIndexesByCategory = new Map<string, number[]>();
  expenses.forEach((expense, expenseIndex) => {
    if (expense.categoryId == null) return;

    const indexes = expenseIndexesByCategory.get(expense.categoryId);
    if (indexes) {
      indexes.push(expenseIndex);
      return;
    }

    expenseIndexesByCategory.set(expense.categoryId, [
      expenseIndex,
    ]);
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
): void {
  if (!/^[0-9a-f]{64}$/u.test(input.fileHash)) {
    throw new StatementImportFileHashInvalidError();
  }

  const details: ErrorDetail[] = [];
  addStringDetail(details, '/fileName', input.fileName, 255);
  addDateDetail(details, '/statementDate', input.statementDate);
  if (!isStatementType(input.statementType)) {
    details.push({
      field: '/statementType',
      code: 'invalid_format',
      message: 'Statement type must be credit_card or e_wallet',
    });
  }
  addStringDetail(details, '/bank', input.bank, 100);
  if (input.cardType != null) {
    addStringDetail(details, '/cardType', input.cardType, 100);
  }
  const isEWallet = input.statementType === 'e_wallet';
  if (isEWallet) {
    addDateDetail(
      details,
      '/transactionHistoryStartDate',
      input.transactionHistoryStartDate,
    );
    if (
      typeof input.transactionHistoryStartDate === 'string' &&
      isValidDomainDate(input.statementDate) &&
      isValidDomainDate(input.transactionHistoryStartDate) &&
      input.transactionHistoryStartDate > input.statementDate
    ) {
      details.push({
        field: '/transactionHistoryStartDate',
        code: 'invalid_bounds',
        message:
          'Transaction History Period start must be on or before its end',
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
    if (input.transactionHistoryStartDate != null) {
      details.push({
        field: '/transactionHistoryStartDate',
        code: 'not_allowed',
        message:
          'Transaction History Period is only valid for E-Wallet imports',
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
        expense.categoryId != null &&
        (typeof expense.categoryId !== 'string' ||
          !POSITIVE_INTEGER_ID_PATTERN.test(expense.categoryId))
      ) {
        details.push({
          field: `${fieldPrefix}/categoryId`,
          code: 'invalid_format',
          message: 'Category ID must be a positive integer string',
        });
      }
      addDateDetail(
        details,
        `${fieldPrefix}/purchaseDate`,
        expense.purchaseDate,
      );
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
      if (
        expense.categoryMatchConfidence != null &&
        (typeof expense.categoryMatchConfidence !== 'string' ||
          !/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/u.test(
            expense.categoryMatchConfidence,
          ))
      ) {
        details.push({
          field: `${fieldPrefix}/categoryMatchConfidence`,
          code: 'invalid_format',
          message: 'Category match confidence must be between 0 and 1',
        });
      }
      if (expense.reference != null) {
        if (
          !isEWallet ||
          !isEWalletProvider(input.bank) ||
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
