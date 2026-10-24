import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import { CategoryInactiveError } from '../../categories/application/category-errors';
import type { ProbableDuplicateGroup } from './probable-duplicates';

export const STATEMENT_IMPORT_NOT_FOUND_CODE = 'STATEMENT_IMPORT_NOT_FOUND';

export class StatementImportNotFoundError extends ApplicationError {
  constructor() {
    super(STATEMENT_IMPORT_NOT_FOUND_CODE, 'Statement import was not found');
  }
}

export const STATEMENT_IMPORT_FILE_HASH_INVALID_CODE =
  'STATEMENT_IMPORT_FILE_HASH_INVALID';

export class StatementImportFileHashInvalidError extends ApplicationError {
  constructor() {
    super(
      STATEMENT_IMPORT_FILE_HASH_INVALID_CODE,
      'The statement file hash must be a lowercase SHA-256 digest',
    );
  }
}

export const STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE =
  'STATEMENT_IMPORT_PROBABLE_DUPLICATES';

export interface ProbableDuplicateErrorDetail extends ErrorDetail {
  expenseIndexes: number[];
  committedExpenseIds: string[];
}

export class StatementImportProbableDuplicatesError extends ApplicationError {
  constructor(groups: readonly ProbableDuplicateGroup[]) {
    const details: ProbableDuplicateErrorDetail[] = groups.map((group) => ({
      field: `/expenses/${group.incomingExpenseIndexes[0]}`,
      code: 'probable_duplicate',
      message: 'The reviewed Expense has a probable duplicate',
      expenseIndexes: group.incomingExpenseIndexes,
      committedExpenseIds: group.committedMatches.map((match) => match.id),
    }));
    super(
      STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
      'Probable duplicate imported Expenses require acknowledgement',
      details,
    );
  }
}

export interface CategoryEligibilityErrorDetail extends ErrorDetail {
  code: 'category_inactive';
  categoryId: string;
  expenseIndexes: number[];
}

export interface CategoryEligibilityConflict {
  categoryId: string;
  expenseIndexes: number[];
}

export class StatementImportCategoryEligibilityError extends CategoryInactiveError {
  constructor(conflicts: readonly CategoryEligibilityConflict[]) {
    super(
      conflicts.map(
        ({ categoryId, expenseIndexes }): CategoryEligibilityErrorDetail => ({
          field: `/expenses/${expenseIndexes[0]}/categoryId`,
          code: 'category_inactive',
          message: 'The reviewed Expense uses an inactive Category',
          categoryId,
          expenseIndexes,
        }),
      ),
    );
  }
}

export class StatementImportValidationError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}
