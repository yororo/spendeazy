import { ApplicationError } from '../../errors/application-error';
import type { ImportAdvisoryWarning } from './confirmation-payload';
import type { SafeImportFailure } from './import-confirmation-store';
export interface ImportPreview {
  warnings: ImportAdvisoryWarning[];
  warningDigest: string;
}
export class ImportConfirmationError extends ApplicationError {
  constructor(public readonly failure: SafeImportFailure) {
    super(
      failure.code,
      'Review the import before confirming.',
      failure.details.map((detail) => ({
        ...detail,
        message: 'Review this field before confirming.',
      })),
    );
  }
}
export class ImportReviewRequiredError extends ImportConfirmationError {
  constructor(public readonly preview: ImportPreview) {
    super({ code: 'IMPORT_REVIEW_REQUIRED', details: [], review: preview });
  }
}
