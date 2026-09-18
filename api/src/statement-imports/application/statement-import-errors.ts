import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import type { ProbableDuplicateGroup } from './probable-duplicates';

export const STATEMENT_IMPORT_NOT_FOUND_CODE = 'STATEMENT_IMPORT_NOT_FOUND';

export class StatementImportNotFoundError extends ApplicationError {
  constructor() {
    super(STATEMENT_IMPORT_NOT_FOUND_CODE, 'Statement import was not found');
  }
}

export const STATEMENT_IMPORT_FILE_ALREADY_EXISTS_CODE =
  'STATEMENT_IMPORT_FILE_ALREADY_EXISTS';

export class StatementImportFileAlreadyExistsError extends ApplicationError {
  constructor() {
    const details: ErrorDetail[] = [
      {
        field: '/fileHash',
        code: 'not_unique',
        message: 'The statement file has already been imported',
      },
    ];
    super(
      STATEMENT_IMPORT_FILE_ALREADY_EXISTS_CODE,
      'The statement file has already been imported',
      details,
    );
  }
}

export const STATEMENT_IMPORT_FILE_HASH_INVALID_CODE =
  'STATEMENT_IMPORT_FILE_HASH_INVALID';

export class StatementImportFileHashInvalidError extends ApplicationError {
  constructor() {
    super(
      STATEMENT_IMPORT_FILE_HASH_INVALID_CODE,
      'The statement file hash must be a lowercase SHA-256 digest',
    );
  }
}

export const STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE =
  'STATEMENT_IMPORT_PROBABLE_DUPLICATES';

export interface ProbableDuplicateErrorDetail extends ErrorDetail {
  transactionIndexes: number[];
  committedTransactionIds: string[];
}

export class StatementImportProbableDuplicatesError extends ApplicationError {
  constructor(groups: readonly ProbableDuplicateGroup[]) {
    const details: ProbableDuplicateErrorDetail[] = groups.map((group) => ({
      field: `/transactions/${group.incomingTransactionIndexes[0]}`,
      code: 'probable_duplicate',
      message: 'The reviewed transaction has a probable duplicate',
      transactionIndexes: group.incomingTransactionIndexes,
      committedTransactionIds: group.committedMatches.map((match) => match.id),
    }));
    super(
      STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
      'Probable duplicate imported transactions require acknowledgement',
      details,
    );
  }
}

export class StatementImportValidationError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}
