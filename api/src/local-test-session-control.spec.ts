import {
  createSyntheticSessionAuthority,
  createSyntheticTokenVerifier,
  LOCAL_TEST_SECONDARY_USER_ID,
  LOCAL_TEST_USER_ID,
} from '../local-test/synthetic-authentication';
import {
  LocalTestSessionController,
  type LocalTestSessionRequestDto,
} from '../local-test/session-control';
import type { AuthenticatedRequest } from './authentication/authentication';

describe('local test session control', () => {
  const secret = 'local-test-secret';
  const now = 1_800_000_000;

  it('issues a session for a named scenario without accepting a User ID', () => {
    const authority = createSyntheticSessionAuthority(secret, () => now);
    const controller = new LocalTestSessionController(authority);

    const response = controller.issueSession(requestFor(LOCAL_TEST_USER_ID), {
      scenario: 'secondary',
    } satisfies LocalTestSessionRequestDto);

    expect(response.userId).toBe(LOCAL_TEST_SECONDARY_USER_ID);
    expect(response.user).toEqual({
      id: LOCAL_TEST_SECONDARY_USER_ID,
      name: 'Local Test Companion',
      email: 'local-test-companion@example.invalid',
    });
    expect(response.token).toContain('spendeazy-local-test.v1.');
  });

  it('issues a fresh identity with a valid refresh session', async () => {
    const authority = createSyntheticSessionAuthority(secret, () => now);
    const controller = new LocalTestSessionController(authority);

    const response = controller.issueSession(requestFor(LOCAL_TEST_USER_ID), {
      scenario: 'new',
    } satisfies LocalTestSessionRequestDto);
    const verifier = createSyntheticTokenVerifier(secret, () => now);

    await expect(verifier.verify(response.token)).resolves.toMatchObject({
      userId: response.userId,
    });
    expect(response.user.name).toMatch(/^Fresh Local User /);
    expect(response.user.email).toContain('@example.invalid');
  });

  it('models expiration with a refreshed token and revocation with a failed verifier', async () => {
    const authority = createSyntheticSessionAuthority(secret, () => now);
    const controller = new LocalTestSessionController(authority);
    const current = authority.issue(LOCAL_TEST_USER_ID);
    const verifier = createSyntheticTokenVerifier(
      secret,
      () => now,
      authority.isRevoked,
    );

    const expired = controller.expireSession(requestFor(LOCAL_TEST_USER_ID));
    await expect(verifier.verify(expired.expiredSession.token)).rejects.toThrow(
      'outside its validity window',
    );
    await expect(
      verifier.verify(expired.refreshedSession.token),
    ).resolves.toMatchObject({ userId: LOCAL_TEST_USER_ID });

    const revoked = controller.revokeSession(
      requestFor(LOCAL_TEST_USER_ID, current.sessionId),
    );
    expect(revoked.revokedSessionId).toBe(current.sessionId);
    await expect(verifier.verify(current.token)).rejects.toThrow('revoked');
    await expect(
      verifier.verify(revoked.resumeSession.token),
    ).resolves.toMatchObject({ userId: LOCAL_TEST_USER_ID });
  });
});

function requestFor(
  userId: string,
  sessionId = 'local-test-session-control',
): AuthenticatedRequest {
  return {
    authenticatedSession: {
      userId,
      sessionId,
      claims: {},
    },
  } as AuthenticatedRequest;
}
