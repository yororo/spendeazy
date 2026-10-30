import { Inject, Injectable } from '@nestjs/common';
import {
  UnauthenticatedError,
  ClerkProfileUnavailableError,
} from '../../authentication/authentication-errors';
import {
  ACCOUNT_DELETION_STORE,
  type AccountDeletionStore,
} from './account-deletion-store';
import {
  IDENTITY_DELETION_PROVIDER,
  type IdentityDeletionProvider,
} from './identity-deletion-provider';
import { AccountDeletionError, UserNotFoundError } from './user-errors';
import type { AccountDeletionOperationRecord } from './account-deletion-operation';

@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(ACCOUNT_DELETION_STORE)
    private readonly store: AccountDeletionStore,
    @Inject(IDENTITY_DELETION_PROVIDER)
    private readonly provider: IdentityDeletionProvider,
  ) {}

  async request(userId: string, sessionId: string | null) {
    await this.verify(userId, sessionId);
    const existing = await this.store.find(userId);
    if (existing) return this.restricted(existing, sessionId!);
    return this.restricted(
      await this.store.accept(userId, sessionId!),
      sessionId!,
    );
  }

  async status(userId: string, sessionId: string | null) {
    await this.verify(userId, sessionId);
    const operation = await this.store.find(userId);
    if (!operation) throw new UserNotFoundError();
    return this.restricted(operation, sessionId!);
  }

  private restricted(
    operation: AccountDeletionOperationRecord,
    sessionId: string,
  ) {
    if (operation.initiatingSessionId !== sessionId)
      throw new AccountDeletionError(operation.status);
    return { status: operation.status };
  }

  private async verify(userId: string, sessionId: string | null) {
    if (!sessionId) throw new UnauthenticatedError();
    let valid: boolean;
    try {
      valid = await this.provider.verifySession(userId, sessionId);
    } catch {
      throw new ClerkProfileUnavailableError();
    }
    if (!valid) throw new UnauthenticatedError();
  }
}
