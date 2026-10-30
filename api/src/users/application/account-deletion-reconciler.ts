import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  ACCOUNT_DELETION_STORE,
  type AccountDeletionStore,
} from './account-deletion-store';
import {
  IDENTITY_DELETION_PROVIDER,
  IdentityProviderFailure,
  type IdentityDeletionProvider,
} from './identity-deletion-provider';
import type { AccountDeletionFailureCode } from './account-deletion-operation';
import { ExceptionLogger } from '../../logging/exception-logger';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 5;

@Injectable()
export class AccountDeletionReconciler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopping = false;
  private readonly logger = new ExceptionLogger();
  constructor(
    @Inject(ACCOUNT_DELETION_STORE)
    private readonly store: AccountDeletionStore,
    @Inject(IDENTITY_DELETION_PROVIDER)
    private readonly provider: IdentityDeletionProvider,
  ) {}
  onApplicationBootstrap() {
    this.schedule(0);
  }
  async onApplicationShutdown() {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.running;
  }
  private schedule(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.poll()
        .catch((error) =>
          this.logger.report('account_deletion_reconciliation_failed', error),
        )
        .finally(() => this.schedule(POLL_INTERVAL_MS));
    }, delay);
    this.timer.unref();
  }
  async poll() {
    for (let count = 0; count < BATCH_SIZE && !this.stopping; count++) {
      const operation = await this.store.claim();
      if (!operation) return;
      let failure: AccountDeletionFailureCode | null = null;
      let retryAfterMs = 0;
      if (!operation.personalDataPurgedAt) {
        try {
          await this.store.purgePersonalData(operation);
          await this.store.checkpoint(operation, 'personalDataPurgedAt');
        } catch {
          failure = 'personal_cleanup_failed';
          this.logger.reportAccountDeletionStageFailure('personal', failure);
        }
      }
      // Recheck sessions even after a saved checkpoint until identity absence is confirmed.
      try {
        await this.provider.revokeSessions(operation.oldClerkUserId);
        if (!operation.providerDeletedAt) {
          await this.provider.deleteIdentity(operation.oldClerkUserId);
          await this.store.checkpoint(operation, 'providerDeletedAt');
        }
        await this.provider.revokeSessions(operation.oldClerkUserId);
        await this.store.checkpoint(operation, 'sessionsRevokedAt');
      } catch (error) {
        failure =
          error instanceof IdentityProviderFailure
            ? error.code
            : 'reconciliation_failed';
        retryAfterMs =
          error instanceof IdentityProviderFailure
            ? (error.retryAfterMs ?? 0)
            : 0;
        this.logger.reportAccountDeletionStageFailure('provider', failure);
      }
      await this.store.finishAttempt(operation, failure, retryAfterMs);
    }
  }
}
