import type {
  CommittedImportResult,
  ConfirmedExpense,
  PrivateConfirmationPayload,
} from './confirmation-payload';

export interface ImportOperationKey {
  actorUserId: string;
  spaceId: string;
  operationId: string;
}
export interface ImportOperationRecord extends ImportOperationKey {
  requestHash: string;
  status: 'pending' | 'committed' | 'not_committed';
  statementImportId: string | null;
  successResult: CommittedImportResult | null;
  failure: SafeImportFailure | null;
  createdAt: Date;
}
/** No free-form messages or request/evidence snapshots in terminal failure storage. */
export interface SafeImportFailure {
  code: string;
  details: { field: string; code: string }[];
}
export interface ImportRowSnapshot {
  id: string;
  statementImportId: string;
  spaceId: string;
  sourceRowId: string;
  disposition: 'included' | 'excluded';
  originalEvidence: PrivateConfirmationPayload['evidence']['transactions'][number];
  confirmedValues: ConfirmedExpense | null;
  exclusion: PrivateConfirmationPayload['excluded'][number] | null;
}

/** All methods use the caller's transaction. Execution locks User → Space → operation.
 * Admission ends its short transaction before execution attempts actor/Space locks. */
export interface ImportOperationStore {
  admit(
    key: ImportOperationKey,
    requestHash: string,
  ): Promise<ImportOperationRecord>;
  find(
    key: ImportOperationKey,
    lock: boolean,
  ): Promise<ImportOperationRecord | null>;
  commit(key: ImportOperationKey, result: CommittedImportResult): Promise<void>;
  reject(key: ImportOperationKey, failure: SafeImportFailure): Promise<void>;
}
export interface ImportRowStore {
  createRows(
    spaceId: string,
    statementImportId: string,
    payload: PrivateConfirmationPayload,
  ): Promise<ImportRowSnapshot[]>;
  findRows(
    spaceId: string,
    statementImportId: string,
  ): Promise<ImportRowSnapshot[]>;
}
