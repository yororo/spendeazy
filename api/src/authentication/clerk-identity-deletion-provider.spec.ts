import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { ClerkAPIResponseError } from '@clerk/backend/errors';
import type { AppConfig } from '../config/app-config';
import { ClerkIdentityDeletionProvider } from './clerk-identity-deletion-provider';

jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn() }));
const apiError = (status: number, retryAfter?: number) =>
  new ClerkAPIResponseError('private provider error', {
    status,
    data: [],
    retryAfter,
  });

describe('Clerk deletion adapter', () => {
  const sessions = {
    getSession: jest.fn(),
    getSessionList: jest.fn(),
    revokeSession: jest.fn(),
  };
  const users = { getUser: jest.fn(), deleteUser: jest.fn() };
  let provider: ClerkIdentityDeletionProvider;
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(createClerkClient)
      .mockReturnValue({ sessions, users } as unknown as ClerkClient);
    provider = new ClerkIdentityDeletionProvider({
      clerkSecretKey: 'sk_test_fake',
    } as AppConfig);
    sessions.getSessionList.mockResolvedValue({ data: [], totalCount: 0 });
  });
  it('checks the live session owner, state and expiry', async () => {
    sessions.getSession.mockResolvedValue({
      userId: 'user',
      status: 'active',
      expireAt: Date.now() + 10000,
    });
    await expect(provider.verifySession('user', 'session')).resolves.toBe(true);
    await expect(provider.verifySession('other', 'session')).resolves.toBe(
      false,
    );
    sessions.getSession.mockRejectedValue(apiError(404));
    await expect(provider.verifySession('user', 'session')).resolves.toBe(
      false,
    );
  });
  it('paginates all session states and reconciles already-revoked/lost responses', async () => {
    sessions.getSessionList
      .mockResolvedValueOnce({
        data: [{ id: 'a', status: 'active' }],
        totalCount: 101,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'b', status: 'revoked' }],
        totalCount: 101,
      });
    sessions.revokeSession.mockRejectedValue(new Error('lost response'));
    sessions.getSession.mockResolvedValue({ status: 'revoked' });
    await provider.revokeSessions('user');
    expect(sessions.getSessionList).toHaveBeenNthCalledWith(2, {
      userId: 'user',
      limit: 100,
      offset: 1,
    });
    expect(sessions.revokeSession).toHaveBeenCalledTimes(1);
  });
  it('reconciles lost deletion responses by reading absence', async () => {
    users.getUser
      .mockResolvedValueOnce({ id: 'user' })
      .mockRejectedValue(apiError(404));
    users.deleteUser.mockRejectedValue(new Error('timeout'));
    await expect(provider.deleteIdentity('user')).resolves.toBeUndefined();
    users.getUser.mockRejectedValue(apiError(404));
    await expect(provider.deleteIdentity('user')).resolves.toBeUndefined();
    expect(users.deleteUser).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, 'provider_configuration'],
    [403, 'provider_configuration'],
    [429, 'provider_rate_limited'],
    [500, 'provider_unavailable'],
  ])('does not confuse %s with absence', async (status, code) => {
    users.getUser.mockRejectedValue(apiError(status, 23));
    await expect(provider.deleteIdentity('user')).rejects.toMatchObject({
      code,
    });
    expect(users.deleteUser).not.toHaveBeenCalled();
  });
  it('accepts missing session lists only after independently confirming provider absence', async () => {
    sessions.getSessionList.mockRejectedValue(apiError(404));
    users.getUser.mockResolvedValue({ id: 'user' });
    await expect(provider.revokeSessions('user')).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
    users.getUser.mockRejectedValue(apiError(404));
    await expect(provider.revokeSessions('user')).resolves.toBeUndefined();
  });
});
