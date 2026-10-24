import { ApplicationError } from '../../errors/application-error';

export const EXPENSE_NOT_FOUND_CODE = 'EXPENSE_NOT_FOUND';

export class ExpenseNotFoundError extends ApplicationError {
  constructor() {
    super(EXPENSE_NOT_FOUND_CODE, 'Expense was not found');
  }
}
