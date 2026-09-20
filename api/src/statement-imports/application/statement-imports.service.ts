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
  StatementImportValidationError,
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
import type { ImportedTransactionRecord } from '../../transactions/application/imported-transaction-store';

export const DEFAULT_STATEMENT_IMPORT_PAGE_SIZE = 20;
export const MAX_STATEMENT_IMPORT_PAGE_SIZE = 100;

export interface ReviewedStatementTransactionInput {
  categoryId?: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
  categoryMatchConfidence?: string | null;
}

export interface CommitReviewedStatementImportInput {
  fileName: string;
  fileHash: string;
  statementDate: string;
  bank: string;
  cardType?: string | null;
  transactions: ReviewedStatementTransactionInput[];
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
  ) {}

  commitReviewedStatementImport(
    userId: string,
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
      this.commitWithinTransaction(context, userId, input),
    );
  }

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
      this.commitWithinTransaction(context, userId, input, spaceId),
    );
  }

  async getStatementImport(
    userId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord> {
    const statementImport = await this.statementImportStore.findById(
      userId,
      statementImportId,
    );
    if (!statementImport) {
      throw new StatementImportNotFoundError();
    }

    return statementImport;
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

  async listStatementImports(
    userId: string,
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
    const records = await this.statementImportStore.findPage({
      userId,
      filters,
      after,
      pageSize,
    });
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

  private async commitWithinTransaction(
    context: StatementImportConfirmationContext,
    userId: string,
    input: CommitReviewedStatementImportInput,
    spaceId?: string,
  ): Promise<StatementImportRecord> {
    validateReviewedStatementInput(input);

    const user = await context.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    if (spaceId !== undefined) {
      if (!context.spaces) {
        throw new Error('Space statement import persistence is not configured');
      }

      await context.spaces.lockForStatementImport(spaceId, userId);
    }

    const existingImport =
      spaceId === undefined
        ? await context.statementImports.findByFileHash(userId, input.fileHash)
        : await requireSpaceStatementImportLookup(
            context,
            spaceId,
            input.fileHash,
          );
    if (existingImport) {
      throw new StatementImportFileAlreadyExistsError();
    }

    await ensureCategoriesAreActive(
      context,
      userId,
      input.transactions,
      spaceId,
    );
    const preparedTransactions = input.transactions.map((transaction) => ({
      categoryId: transaction.categoryId ?? null,
      purchaseDate: transaction.purchaseDate,
      description: transaction.description.trim(),
      amount: normalizeAmount(transaction.amount),
      categoryMatchConfidence: transaction.categoryMatchConfidence ?? null,
      importFingerprint: computeImportFingerprint(input, transaction),
    }));

    const probableDuplicateGroups = await findProbableDuplicates(
      context,
      userId,
      preparedTransactions,
      spaceId,
    );
    if (
      probableDuplicateGroups.length > 0 &&
      !input.acknowledgeProbableDuplicates
    ) {
      throw new StatementImportProbableDuplicatesError(probableDuplicateGroups);
    }

    const statementImport = await context.statementImports.create({
      userId,
      importedByUserId: userId,
      ...(spaceId === undefined ? {} : { spaceId }),
      fileName: input.fileName,
      fileHash: input.fileHash,
      statementDate: input.statementDate,
      bank: input.bank,
      cardType: input.cardType ?? null,
      importedAt: new Date(),
    });

    for (const transaction of preparedTransactions) {
      await context.importedTransactions.create({
        userId,
        ...(spaceId === undefined ? {} : { spaceId, addedByUserId: userId }),
        categoryId: transaction.categoryId ?? null,
        statementImportId: statementImport.id,
        purchaseDate: transaction.purchaseDate,
        description: transaction.description,
        amount: transaction.amount,
        categoryMatchConfidence: transaction.categoryMatchConfidence,
        importFingerprint: transaction.importFingerprint,
      });
    }

    return statementImport;
  }
}

async function requireSpaceStatementImportLookup(
  context: StatementImportConfirmationContext,
  spaceId: string,
  fileHash: string,
): Promise<StatementImportRecord | null> {
  return context.statementImports.findByFileHashInSpace(spaceId, fileHash);
}

async function findProbableDuplicates(
  context: StatementImportConfirmationContext,
  userId: string,
  preparedTransactions: readonly {
    importFingerprint: string;
  }[],
  spaceId?: string,
) {
  const fingerprints = [
    ...new Set(
      preparedTransactions.map((transaction) => transaction.importFingerprint),
    ),
  ];
  const committedMatchesByFingerprint = new Map<string, { id: string }[]>();

  for (const fingerprint of fingerprints) {
    const committedMatches =
      spaceId === undefined
        ? await context.importedTransactions.findByFingerprint(
            userId,
            fingerprint,
          )
        : await requireSpaceFingerprintLookup(context, spaceId, fingerprint);
    committedMatchesByFingerprint.set(fingerprint, committedMatches);
  }

  return findProbableDuplicateGroups(
    preparedTransactions.map((transaction, transactionIndex) => ({
      transactionIndex,
      fingerprint: transaction.importFingerprint,
    })),
    committedMatchesByFingerprint,
  );
}

async function ensureCategoriesAreActive(
  context: StatementImportConfirmationContext,
  userId: string,
  transactions: ReviewedStatementTransactionInput[],
  spaceId?: string,
): Promise<void> {
  const categoryIds = new Set(
    transactions
      .map((transaction) => transaction.categoryId)
      .filter((categoryId): categoryId is string => categoryId != null),
  );

  for (const categoryId of categoryIds) {
    const category =
      spaceId === undefined
        ? await context.categories.findById(userId, categoryId)
        : await requireSpaceCategoryLookup(context, spaceId, categoryId);
    assertActiveCategory(category);
  }
}

async function requireSpaceFingerprintLookup(
  context: StatementImportConfirmationContext,
  spaceId: string,
  fingerprint: string,
): Promise<ImportedTransactionRecord[]> {
  return context.importedTransactions.findByFingerprintInSpace(
    spaceId,
    fingerprint,
  );
}

async function requireSpaceCategoryLookup(
  context: StatementImportConfirmationContext,
  spaceId: string,
  categoryId: string,
) {
  return context.categories.findBySpaceId(spaceId, categoryId);
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
  addStringDetail(details, '/bank', input.bank, 100);
  if (input.cardType != null) {
    addStringDetail(details, '/cardType', input.cardType, 100);
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

  if (!Array.isArray(input.transactions)) {
    details.push({
      field: '/transactions',
      code: 'invalid_format',
      message: 'Transactions must be an array',
    });
  } else {
    input.transactions.forEach((transaction, index) => {
      const fieldPrefix = `/transactions/${index}`;
      if (transaction === null || typeof transaction !== 'object') {
        details.push({
          field: fieldPrefix,
          code: 'invalid_format',
          message: 'Transaction must be an object',
        });
        return;
      }
      if (
        transaction.categoryId != null &&
        (typeof transaction.categoryId !== 'string' ||
          !POSITIVE_INTEGER_ID_PATTERN.test(transaction.categoryId))
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
        transaction.purchaseDate,
      );
      addStringDetail(
        details,
        `${fieldPrefix}/description`,
        transaction.description,
        500,
      );
      if (
        typeof transaction.amount !== 'string' ||
        !POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.test(transaction.amount)
      ) {
        details.push({
          field: `${fieldPrefix}/amount`,
          code: 'invalid_format',
          message: 'Amount must be a positive two-decimal string',
        });
      }
      if (
        transaction.categoryMatchConfidence != null &&
        (typeof transaction.categoryMatchConfidence !== 'string' ||
          !/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/u.test(
            transaction.categoryMatchConfidence,
          ))
      ) {
        details.push({
          field: `${fieldPrefix}/categoryMatchConfidence`,
          code: 'invalid_format',
          message: 'Category match confidence must be between 0 and 1',
        });
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
