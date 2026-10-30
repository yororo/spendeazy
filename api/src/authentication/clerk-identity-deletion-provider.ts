import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { isClerkAPIResponseError } from '@clerk/backend/errors';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import {
  IdentityProviderFailure,
  type IdentityDeletionProvider,
} from '../users/application/identity-deletion-provider';

const SESSION_PAGE_SIZE = 100;
const TERMINAL_SESSION_STATES = new Set([
  'revoked',
  'ended',
  'expired',
  'abandoned',
  'removed',
  'replaced',
]);

@Injectable()
export class ClerkIdentityDeletionProvider implements IdentityDeletionProvider {
  private readonly client: ClerkClient | null;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = config.clerkSecretKey
      ? createClerkClient({ secretKey: config.clerkSecretKey })
      : null;
  }
  private configured(): ClerkClient {
    if (!this.client)
      throw new IdentityProviderFailure('provider_configuration');
    return this.client;
  }
  async verifySession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const session = await this.configured().sessions.getSession(sessionId);
      return (
        session.userId === userId &&
        session.status === 'active' &&
        session.expireAt > Date.now()
      );
    } catch (error) {
      if (isClerkAPIResponseError(error) && error.status === 404) return false;
      throw classify(error);
    }
  }
  async revokeSessions(userId: string): Promise<void> {
    try {
      // Enumerate without a status filter: revocation must not shift pagination.
      const ids: string[] = [];
      for (let offset = 0; ;) {
        const page = await this.configured().sessions.getSessionList({
          userId,
          limit: SESSION_PAGE_SIZE,
          offset,
        });
        ids.push(
          ...page.data
            .filter((session) => !TERMINAL_SESSION_STATES.has(session.status))
            .map((session) => session.id),
        );
        if (offset + page.data.length >= page.totalCount) break;
        if (!page.data.length)
          throw new IdentityProviderFailure('provider_unavailable');
        offset += page.data.length;
      }
      for (const id of ids) {
        try {
          const session = await this.configured().sessions.revokeSession(id);
          if (!TERMINAL_SESSION_STATES.has(session.status))
            throw new IdentityProviderFailure('provider_unavailable');
        } catch (error) {
          // A lost response/already-revoked error is success only after rereading.
          try {
            const session = await this.configured().sessions.getSession(id);
            if (!TERMINAL_SESSION_STATES.has(session.status)) throw error;
          } catch (readError) {
            if (!(
              isClerkAPIResponseError(readError) && readError.status === 404
            ))
              throw readError;
          }
        }
      }
    } catch (error) {
      if (isClerkAPIResponseError(error) && error.status === 404) {
        try {
          await this.configured().users.getUser(userId);
        } catch (readError) {
          if (isClerkAPIResponseError(readError) && readError.status === 404)
            return;
          throw classify(readError);
        }
      }
      throw classify(error);
    }
  }
  async deleteIdentity(userId: string): Promise<void> {
    try {
      try {
        await this.configured().users.getUser(userId);
      } catch (error) {
        if (isClerkAPIResponseError(error) && error.status === 404) return;
        throw error;
      }
      try {
        await this.configured().users.deleteUser(userId);
      } catch (error) {
        // Retry reads absence rather than requiring the lost delete response.
        try {
          await this.configured().users.getUser(userId);
        } catch (readError) {
          if (isClerkAPIResponseError(readError) && readError.status === 404)
            return;
          throw readError;
        }
        throw error;
      }
      // The reconciler sweeps sessions again after this independent absence check.
      try {
        await this.configured().users.getUser(userId);
      } catch (error) {
        if (isClerkAPIResponseError(error) && error.status === 404) {
          return;
        }
        throw error;
      }
      throw new IdentityProviderFailure('provider_unavailable');
    } catch (error) {
      throw classify(error);
    }
  }
}

function classify(error: unknown): IdentityProviderFailure {
  if (error instanceof IdentityProviderFailure) return error;
  if (isClerkAPIResponseError(error)) {
    if (error.status === 429)
      return new IdentityProviderFailure(
        'provider_rate_limited',
        (error.retryAfter ?? 0) * 1000,
      );
    if (error.status === 401 || error.status === 403)
      return new IdentityProviderFailure('provider_configuration');
  }
  return new IdentityProviderFailure('provider_unavailable');
}
