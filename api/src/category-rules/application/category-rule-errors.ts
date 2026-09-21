import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';

export const CATEGORY_RULE_NOT_FOUND_CODE = 'CATEGORY_RULE_NOT_FOUND';
export const CATEGORY_RULE_PATTERN_ALREADY_EXISTS_CODE =
  'CATEGORY_RULE_PATTERN_ALREADY_EXISTS';

export class CategoryRuleNotFoundError extends ApplicationError {
  constructor() {
    super(CATEGORY_RULE_NOT_FOUND_CODE, 'Category rule was not found');
  }
}

export class CategoryRulePatternConflictError extends ApplicationError {
  constructor(categoryId?: string, field = '/pattern') {
    const details: ErrorDetail[] = [
      {
        field,
        code: 'not_unique',
        message: 'Category rule pattern is already in use',
        ...(categoryId === undefined ? {} : { categoryId }),
      },
    ];
    super(
      CATEGORY_RULE_PATTERN_ALREADY_EXISTS_CODE,
      'Category rule pattern is already in use',
      details,
    );
  }
}
