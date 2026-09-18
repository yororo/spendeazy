import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import {
  USER_NOT_FOUND_CODE,
  USER_NOT_PROVISIONED_CODE,
  VALIDATION_FAILED_CODE,
} from '../../errors/application-error-codes';

export const USER_EMAIL_ALREADY_EXISTS_CODE = 'EMAIL_ALREADY_EXISTS';

export class UserNotFoundError extends ApplicationError {
  constructor() {
    super(USER_NOT_FOUND_CODE, 'User was not found');
  }
}

export class UserEmailConflictError extends ApplicationError {
  constructor() {
    const details: ErrorDetail[] = [
      {
        field: '/email',
        code: 'not_unique',
        message: 'Email is already in use',
      },
    ];
    super(USER_EMAIL_ALREADY_EXISTS_CODE, 'Email is already in use', details);
  }
}

export class UserNotProvisionedError extends ApplicationError {
  constructor() {
    super(USER_NOT_PROVISIONED_CODE, 'User is not provisioned');
  }
}

export class UserProfileEmailRequiredError extends ApplicationError {
  constructor() {
    super(
      VALIDATION_FAILED_CODE,
      'The Clerk user profile must include a primary verified email',
    );
  }
}

export class UserProfileInvalidError extends ApplicationError {
  constructor() {
    super(
      VALIDATION_FAILED_CODE,
      'The Clerk user profile cannot be used as a local User',
    );
  }
}
