import { ApplicationError } from '../../errors/application-error';
import {
  SPACE_NOT_FOUND_CODE,
  SPACE_NOT_WRITABLE_CODE,
} from '../../errors/application-error-codes';

export { SPACE_NOT_FOUND_CODE, SPACE_NOT_WRITABLE_CODE };

export class SpaceNotFoundError extends ApplicationError {
  constructor() {
    super(SPACE_NOT_FOUND_CODE, 'Space was not found');
  }
}

export class SpaceNotWritableError extends ApplicationError {
  constructor() {
    super(SPACE_NOT_WRITABLE_CODE, 'Space is not writable');
  }
}
