import { ApplicationError } from '../../errors/application-error';

export const EXPENSE_NOT_FOUND_CODE = 'EXPENSE_NOT_FOUND';

export class ExpenseNotFoundError extends ApplicationError {
  constructor() {
    super(EXPENSE_NOT_FOUND_CODE, 'Expense was not found');
  }
}

export const IMPORTED_EXPENSE_IMMUTABLE_CODE = 'IMPORTED_EXPENSE_IMMUTABLE';

export class ImportedExpenseImmutableError extends ApplicationError {
  constructor() {
    super(
      IMPORTED_EXPENSE_IMMUTABLE_CODE,
      'Imported expense statement facts cannot be changed',
    );
  }
}
