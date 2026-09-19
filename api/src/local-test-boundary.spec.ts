import { createHmac } from 'node:crypto';

import {
  createSyntheticProfileService,
  createSyntheticSessionToken,
  createSyntheticTokenVerifier,
  LOCAL_TEST_FRESH_USER_ID_PREFIX,
  LOCAL_TEST_SECONDARY_USER_ID,
  LOCAL_TEST_USER_ID,
} from '../local-test/synthetic-authentication';

describe('local synthetic authentication boundary', () => {
  const secret = 'local-test-secret';
  const now = 1_800_000_000;

  it('verifies a temporary token for the fixed fictional User', async () => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);
    const token = createSyntheticSessionToken(secret, {
      sessionId: 'local-test-session-abc123',
      userId: LOCAL_TEST_USER_ID,
      issuedAt: now,
      expiresAt: now + 900,
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: LOCAL_TEST_USER_ID,
      sessionId: 'local-test-session-abc123',
    });
  });

  it('verifies a temporary token for the second populated fictional User', async () => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);
    const token = createSyntheticSessionToken(secret, {
      sessionId: 'local-test-session-secondary',
      userId: LOCAL_TEST_SECONDARY_USER_ID,
      issuedAt: now,
      expiresAt: now + 900,
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: LOCAL_TEST_SECONDARY_USER_ID,
    });
  });

  it.each([
    ['missing credentials', ''],
    ['invalid credentials', 'not-a-token'],
    ['a modified token', 'spendeazy-local-test.v1.invalid.invalid'],
  ])('rejects %s', async (_description, token) => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);

    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects an expired token and a token for an arbitrary User ID', async () => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);
    const expired = createSyntheticSessionToken(secret, {
      sessionId: 'local-test-session-expired',
      userId: LOCAL_TEST_USER_ID,
      issuedAt: now - 901,
      expiresAt: now - 1,
    });

    await expect(verifier.verify(expired)).rejects.toThrow(
      'outside its validity window',
    );

    const arbitraryPayload = Buffer.from(
      JSON.stringify({
        environment: 'spendeazy-local-test',
        sub: 'arbitrary-user-id',
        sid: 'local-test-session-arbitrary',
        iat: now,
        exp: now + 900,
      }),
      'utf8',
    ).toString('base64url');
    const unsignedToken = `spendeazy-local-test.v1.${arbitraryPayload}`;
    const arbitrarySignature = createHmac('sha256', secret)
      .update(unsignedToken)
      .digest('base64url');
    const arbitraryToken = `${unsignedToken}.${arbitrarySignature}`;

    await expect(verifier.verify(arbitraryToken)).rejects.toThrow();
  });

  it('provides a profile only for the fixed fictional User', async () => {
    const profileService = createSyntheticProfileService();

    await expect(
      profileService.getUserProfile(LOCAL_TEST_USER_ID),
    ).resolves.toMatchObject({
      fullName: 'Local Test User',
      primaryVerifiedEmail: 'local-test-user@example.invalid',
    });
    await expect(
      profileService.getUserProfile('arbitrary-user-id'),
    ).resolves.toBeNull();
  });

  it('provides distinct profiles for the second and fresh fictional Users', async () => {
    const profileService = createSyntheticProfileService();
    const freshUserId = `${LOCAL_TEST_FRESH_USER_ID_PREFIX}abc123`;

    await expect(
      profileService.getUserProfile(LOCAL_TEST_SECONDARY_USER_ID),
    ).resolves.toEqual({
      fullName: 'Local Test Companion',
      primaryVerifiedEmail: 'local-test-companion@example.invalid',
    });
    await expect(profileService.getUserProfile(freshUserId)).resolves.toEqual({
      fullName: 'Fresh Local User abc123',
      primaryVerifiedEmail: `${freshUserId}@example.invalid`,
    });
  });

  it('rejects a signed token for an arbitrary identity even with the local secret', async () => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);
    const arbitraryPayload = Buffer.from(
      JSON.stringify({
        environment: 'spendeazy-local-test',
        sub: 'arbitrary-user-id',
        sid: 'local-test-session-arbitrary',
        iat: now,
        exp: now + 900,
      }),
      'utf8',
    ).toString('base64url');
    const unsignedToken = `spendeazy-local-test.v1.${arbitraryPayload}`;
    const arbitrarySignature = createHmac('sha256', secret)
      .update(unsignedToken)
      .digest('base64url');

    await expect(
      verifier.verify(`${unsignedToken}.${arbitrarySignature}`),
    ).rejects.toThrow();
  });
});
