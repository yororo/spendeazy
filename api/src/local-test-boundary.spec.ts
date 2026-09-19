import { createHmac } from 'node:crypto';

import {
  createSyntheticProfileService,
  createSyntheticSessionToken,
  createSyntheticTokenVerifier,
  LOCAL_TEST_USER_ID,
} from '../local-test/synthetic-authentication';

describe('local synthetic authentication boundary', () => {
  const secret = 'local-test-secret';
  const now = 1_800_000_000;

  it('verifies a temporary token for the fixed fictional User', async () => {
    const verifier = createSyntheticTokenVerifier(secret, () => now);
    const token = createSyntheticSessionToken(secret, {
      sessionId: 'local-test-session-abc123',
      issuedAt: now,
      expiresAt: now + 900,
    });

    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: LOCAL_TEST_USER_ID,
      sessionId: 'local-test-session-abc123',
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
});
