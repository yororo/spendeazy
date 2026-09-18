import { ApplicationError } from '../errors/application-error';
import {
  SERVICE_UNAVAILABLE_CODE,
  UNAUTHENTICATED_CODE,
} from '../errors/application-error-codes';

export class UnauthenticatedError extends ApplicationError {
  constructor() {
    super(UNAUTHENTICATED_CODE, 'Authentication required');
  }
}

export class ClerkProfileUnavailableError extends ApplicationError {
  constructor() {
    super(
      SERVICE_UNAVAILABLE_CODE,
      'The identity provider is temporarily unavailable',
    );
  }
}
