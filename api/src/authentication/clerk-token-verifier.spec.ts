import { verifyToken } from '@clerk/backend';

import type { AppConfig } from '../config/app-config';
import { OfficialClerkTokenVerifier } from './clerk-token-verifier';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

describe('OfficialClerkTokenVerifier', () => {
  const verifyTokenMock = jest.mocked(verifyToken);

  beforeEach(() => {
    verifyTokenMock.mockReset();
  });

  it('verifies a native session with the configured PEM key', async () => {
    verifyTokenMock.mockResolvedValue({
      sub: 'user_42',
      sid: 'session_42',
    });
    const verifier = new OfficialClerkTokenVerifier(testAppConfig());

    await expect(verifier.verify('clerk-session-token')).resolves.toEqual({
      userId: 'user_42',
      sessionId: 'session_42',
      claims: { sub: 'user_42', sid: 'session_42' },
    });
    expect(verifyTokenMock).toHaveBeenCalledWith('clerk-session-token', {
      jwtKey: 'pem-public-key',
      headerType: 'JWT',
    });
  });

  it('rejects a verified payload that does not identify a user', async () => {
    verifyTokenMock.mockResolvedValue({ data: { sid: 'session_42' } });
    const verifier = new OfficialClerkTokenVerifier(testAppConfig());

    await expect(verifier.verify('clerk-session-token')).rejects.toThrow(
      'Clerk session token does not identify a user',
    );
  });
});

function testAppConfig(): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: undefined,
    clerkJwtKey: 'pem-public-key',
    clerkSecretKey: 'test-secret-key',
  };
}
