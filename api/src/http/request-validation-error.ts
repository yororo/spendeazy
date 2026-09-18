import {
  ApplicationError,
  type ErrorDetail,
} from '../errors/application-error';
import { VALIDATION_FAILED_CODE } from '../errors/application-error-codes';

export class RequestValidationError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super(
      VALIDATION_FAILED_CODE,
      'The request contains invalid fields.',
      details,
    );
  }
}
