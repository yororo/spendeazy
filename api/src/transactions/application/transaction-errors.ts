import { ApplicationError } from '../../errors/application-error';

export const TRANSACTION_NOT_FOUND_CODE = 'TRANSACTION_NOT_FOUND';

export class TransactionNotFoundError extends ApplicationError {
  constructor() {
    super(TRANSACTION_NOT_FOUND_CODE, 'Transaction was not found');
  }
}

export const IMPORTED_TRANSACTION_IMMUTABLE_CODE =
  'IMPORTED_TRANSACTION_IMMUTABLE';

export class ImportedTransactionImmutableError extends ApplicationError {
  constructor() {
    super(
      IMPORTED_TRANSACTION_IMMUTABLE_CODE,
      'Imported transaction statement facts cannot be changed',
    );
  }
}
