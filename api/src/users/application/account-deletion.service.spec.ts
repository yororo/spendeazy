import { AccountDeletionService } from './account-deletion.service';
import type { AccountDeletionStore } from './account-deletion-store';
import type { IdentityDeletionProvider } from './identity-deletion-provider';
import { AccountDeletionError, UserNotFoundError } from './user-errors';
import {
  UnauthenticatedError,
  ClerkProfileUnavailableError,
} from '../../authentication/authentication-errors';

describe('account deletion credential protocol', () => {
  const operation = { status: 'pending', initiatingSessionId: 'session-a' };
  const store = { find: jest.fn(), accept: jest.fn() };
  const provider = { verifySession: jest.fn() };
  const service = new AccountDeletionService(
    store as unknown as AccountDeletionStore,
    provider as unknown as IdentityDeletionProvider,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    provider.verifySession.mockResolvedValue(true);
    store.find.mockResolvedValue(null);
    store.accept.mockResolvedValue(operation);
  });
  it('accepts once and returns only status on initiating-session retries', async () => {
    await expect(service.request('user-a', 'session-a')).resolves.toEqual({
      status: 'pending',
    });
    store.find.mockResolvedValue(operation);
    await expect(service.request('user-a', 'session-a')).resolves.toEqual({
      status: 'pending',
    });
    expect(store.accept).toHaveBeenCalledTimes(1);
    await expect(service.status('user-a', 'session-a')).resolves.toEqual({
      status: 'pending',
    });
    store.find.mockResolvedValue({ ...operation, status: 'completed' });
    await expect(service.request('user-a', 'session-a')).resolves.toEqual({
      status: 'completed',
    });
  });
  it('does not grant another session progress or normal access', async () => {
    store.find.mockResolvedValue(operation);
    await expect(service.status('user-a', 'session-b')).rejects.toBeInstanceOf(
      AccountDeletionError,
    );
    await expect(service.request('user-a', 'session-b')).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PENDING',
    });
    expect(store.accept).not.toHaveBeenCalled();
  });
  it('never reports completion from revocation, absence or provider unavailability', async () => {
    await expect(service.status('user-a', 'session-a')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    provider.verifySession.mockResolvedValue(false);
    await expect(service.status('user-a', 'session-a')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(service.request('user-a', null)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    provider.verifySession.mockRejectedValue(
      new Error('private provider payload'),
    );
    store.find.mockResolvedValue({ ...operation, status: 'completed' });
    await expect(service.status('user-a', 'session-a')).rejects.toBeInstanceOf(
      ClerkProfileUnavailableError,
    );
    expect(store.accept).not.toHaveBeenCalled();
  });
});
