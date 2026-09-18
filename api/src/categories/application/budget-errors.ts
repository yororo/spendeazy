import { ApplicationError } from '../../errors/application-error';

export const BUDGET_NOT_FOUND_CODE = 'BUDGET_NOT_FOUND';

export class BudgetNotFoundError extends ApplicationError {
  constructor() {
    super(BUDGET_NOT_FOUND_CODE, 'Budget was not found');
  }
}
