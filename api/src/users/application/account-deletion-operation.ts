export type AccountDeletionStatus = 'pending' | 'completed';

export type AccountDeletionFailureCode =
  | 'provider_unavailable'
  | 'provider_rate_limited'
  | 'provider_configuration'
  | 'personal_cleanup_failed'
  | 'reconciliation_failed';

// Progress and credential binding only: never add profile or financial snapshots.
export interface AccountDeletionOperationRecord {
  oldClerkUserId: string;
  userId: string;
  initiatingSessionId: string;
  status: AccountDeletionStatus;
  acceptedAt: Date;
  personalDataPurgedAt: Date | null;
  sessionsRevokedAt: Date | null;
  providerDeletedAt: Date | null;
  completedAt: Date | null;
  nextAttemptAt: Date | null;
  attemptCount: number;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  lastFailureCode: AccountDeletionFailureCode | null;
}
