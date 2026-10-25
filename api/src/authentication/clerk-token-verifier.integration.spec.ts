import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import { OfficialClerkTokenVerifier } from './clerk-token-verifier';

describe('Clerk session verification with real signatures', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config: AppConfig = {
    environment: 'test',
    port: 3000,
    databaseUrl: undefined,
    clerkJwtKey: keys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
    clerkSecretKey: 'unused-test-secret',
  };
  const verifier = new OfficialClerkTokenVerifier(config);

  function token(
    claims: Record<string, unknown> = {},
    privateKey: KeyObject = keys.privateKey,
    headerType = 'JWT',
  ) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = [
      encode({ alg: 'RS256', typ: headerType, kid: 'isolated-test-key' }),
      encode({
        sub: 'user_fixture',
        sid: 'session_fixture',
        iss: 'https://fixture.clerk.accounts.dev',
        iat: now,
        nbf: now - 5,
        exp: now + 60,
        ...claims,
      }),
    ].join('.');
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  }

  it('accepts an authentic native session without azp', async () => {
    await expect(verifier.verify(token())).resolves.toMatchObject({
      userId: 'user_fixture',
      sessionId: 'session_fixture',
    });
  });

  it('does not use browser-origin metadata as native authentication', async () => {
    await expect(
      verifier.verify(token({ azp: 'https://app.example.com' })),
    ).resolves.toMatchObject({ userId: 'user_fixture' });
  });

  it('rejects an expired native session', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifier.verify(token({ iat: now - 120, nbf: now - 120, exp: now - 60 })),
    ).rejects.toThrow();
  });

  it('rejects a native session that is not yet valid', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifier.verify(token({ nbf: now + 60, exp: now + 120 })),
    ).rejects.toThrow();
  });

  it('rejects a native session signed by another key', async () => {
    await expect(
      verifier.verify(token({}, otherKeys.privateKey)),
    ).rejects.toThrow();
  });

  it('rejects the wrong JWT header type', async () => {
    await expect(
      verifier.verify(token({}, keys.privateKey, 'unexpected')),
    ).rejects.toThrow();
  });

  it('rejects a native token without a User identity', async () => {
    await expect(verifier.verify(token({ sub: undefined }))).rejects.toThrow();
  });

  it('still requires authentication configuration', async () => {
    const unconfigured = new OfficialClerkTokenVerifier({
      ...config,
      clerkJwtKey: undefined,
    });
    await expect(unconfigured.verify(token())).rejects.toThrow(
      'Clerk authentication is not configured',
    );
  });
});
