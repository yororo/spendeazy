import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';

export const CATEGORY_NOT_FOUND_CODE = 'CATEGORY_NOT_FOUND';
export const CATEGORY_NAME_ALREADY_EXISTS_CODE = 'CATEGORY_NAME_ALREADY_EXISTS';
export const CATEGORY_INACTIVE_CODE = 'CATEGORY_INACTIVE';

export class CategoryNotFoundError extends ApplicationError {
  constructor() {
    super(CATEGORY_NOT_FOUND_CODE, 'Category was not found');
  }
}

export class CategoryNameConflictError extends ApplicationError {
  constructor() {
    const details: ErrorDetail[] = [
      {
        field: '/name',
        code: 'not_unique',
        message: 'Category name is already in use',
      },
    ];
    super(
      CATEGORY_NAME_ALREADY_EXISTS_CODE,
      'Category name is already in use',
      details,
    );
  }
}

export class CategoryInactiveError extends ApplicationError {
  constructor(details: ErrorDetail[] = []) {
    super(CATEGORY_INACTIVE_CODE, 'Category is inactive', details);
  }
}
