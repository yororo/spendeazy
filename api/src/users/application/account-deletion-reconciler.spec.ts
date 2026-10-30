import { AccountDeletionReconciler } from './account-deletion-reconciler';
import type { AccountDeletionStore } from './account-deletion-store';
import {
  IdentityProviderFailure,
  type IdentityDeletionProvider,
} from './identity-deletion-provider';

describe('account deletion reconciliation', () => {
  const operation = {
    oldClerkUserId: 'old-user',
    claimToken: 'claim',
    personalDataPurgedAt: null,
    providerDeletedAt: null,
  };
  const store = {
    claim: jest.fn(),
    purgePersonalData: jest.fn(),
    checkpoint: jest.fn(),
    finishAttempt: jest.fn(),
  };
  const provider = { revokeSessions: jest.fn(), deleteIdentity: jest.fn() };
  const worker = () =>
    new AccountDeletionReconciler(
      store as unknown as AccountDeletionStore,
      provider as unknown as IdentityDeletionProvider,
    );
  beforeEach(() => {
    jest.resetAllMocks();
    store.claim.mockResolvedValueOnce(operation).mockResolvedValue(null);
    store.purgePersonalData.mockResolvedValue(undefined);
    store.checkpoint.mockResolvedValue(undefined);
    provider.revokeSessions.mockResolvedValue(undefined);
    provider.deleteIdentity.mockResolvedValue(undefined);
  });
  it('purges independently during provider outage and honors retry delay', async () => {
    provider.revokeSessions.mockRejectedValue(
      new IdentityProviderFailure('provider_rate_limited', 30_000),
    );
    await worker().poll();
    expect(store.checkpoint).toHaveBeenCalledWith(
      operation,
      'personalDataPurgedAt',
    );
    expect(store.finishAttempt).toHaveBeenCalledWith(
      operation,
      'provider_rate_limited',
      30_000,
    );
    expect(provider.deleteIdentity).not.toHaveBeenCalled();
  });
  it('saves provider progress even when Personal cleanup fails', async () => {
    store.purgePersonalData.mockRejectedValue(new Error('storage'));
    await worker().poll();
    expect(store.checkpoint).toHaveBeenNthCalledWith(
      1,
      operation,
      'providerDeletedAt',
    );
    expect(store.checkpoint).toHaveBeenNthCalledWith(
      2,
      operation,
      'sessionsRevokedAt',
    );
    expect(store.finishAttempt).toHaveBeenCalledWith(
      operation,
      'personal_cleanup_failed',
      0,
    );
    expect(provider.revokeSessions).toHaveBeenCalledTimes(2);
  });
  it('replays external success after a lost checkpoint without assuming completion', async () => {
    store.checkpoint.mockRejectedValueOnce(new Error('lost purge checkpoint'));
    await worker().poll();
    expect(provider.deleteIdentity).toHaveBeenCalledWith('old-user');
    expect(store.finishAttempt).toHaveBeenCalledWith(
      operation,
      'personal_cleanup_failed',
      0,
    );
  });
  it('stops polling and waits for the in-flight attempt on shutdown', async () => {
    const reconciler = worker();
    await reconciler.onApplicationShutdown();
    await reconciler.poll();
    expect(store.claim).not.toHaveBeenCalled();
  });
});
