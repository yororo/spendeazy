import type { StatementImportConfirmationContext } from './statement-import-confirmation';
import type {
  ImportOperationStore,
  ImportRowStore,
} from './import-confirmation-store';
import type { PrivateConfirmationPayload } from './confirmation-payload';
export const REVIEWED_IMPORT_UNIT_OF_WORK = Symbol(
  'REVIEWED_IMPORT_UNIT_OF_WORK',
);
export interface DuplicateHistoryMatch {
  id: string;
  statementImportId: string;
  importFingerprint: string;
  referenceHash: string | null;
}
export interface ReviewedImportContext extends StatementImportConfirmationContext {
  lockExecutionScope(userId: string, spaceId: string): Promise<void>;
  operations: ImportOperationStore;
  rows: ImportRowStore;
  requireReadAccess(userId: string, spaceId: string): Promise<void>;
  findFileMatches(spaceId: string, fileHash: string): Promise<string[]>;
  findDuplicateHistory(
    spaceId: string,
    fingerprints: string[],
    references: string[],
  ): Promise<DuplicateHistoryMatch[]>;
  appendRules(
    spaceId: string,
    rules: PrivateConfirmationPayload['rememberedRules'],
  ): Promise<void>;
  savepoint<T>(work: () => Promise<T>): Promise<T>;
}
export interface ReviewedImportUnitOfWork {
  execute<T>(work: (context: ReviewedImportContext) => Promise<T>): Promise<T>;
}
