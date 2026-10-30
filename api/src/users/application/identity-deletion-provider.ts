import type { AccountDeletionFailureCode } from './account-deletion-operation';

export const IDENTITY_DELETION_PROVIDER = Symbol('IDENTITY_DELETION_PROVIDER');
export interface IdentityDeletionProvider {
  verifySession(userId: string, sessionId: string): Promise<boolean>;
  revokeSessions(userId: string): Promise<void>;
  deleteIdentity(userId: string): Promise<void>;
}
export class IdentityProviderFailure extends Error {
  constructor(
    readonly code: AccountDeletionFailureCode,
    readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}
