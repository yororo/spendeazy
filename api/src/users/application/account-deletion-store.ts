import type {
  AccountDeletionOperationRecord,
  AccountDeletionFailureCode,
} from './account-deletion-operation';

export const ACCOUNT_DELETION_STORE = Symbol('ACCOUNT_DELETION_STORE');
export interface AccountDeletionStore {
  find(clerkUserId: string): Promise<AccountDeletionOperationRecord | null>;
  accept(
    clerkUserId: string,
    sessionId: string,
  ): Promise<AccountDeletionOperationRecord>;
  claim(): Promise<AccountDeletionOperationRecord | null>;
  purgePersonalData(operation: AccountDeletionOperationRecord): Promise<void>;
  checkpoint(
    operation: AccountDeletionOperationRecord,
    stage: 'personalDataPurgedAt' | 'sessionsRevokedAt' | 'providerDeletedAt',
  ): Promise<void>;
  finishAttempt(
    operation: AccountDeletionOperationRecord,
    failure: AccountDeletionFailureCode | null,
    retryAfterMs?: number,
  ): Promise<void>;
}
