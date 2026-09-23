import { loadLocalTestAppConfig } from '../local-test/app-config';

describe('local test app configuration', () => {
  it('provides stable Invite Code protection for the dedicated local test API', () => {
    const config = loadLocalTestAppConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://spendeazy_test_user:spendeazy_local_test_password@127.0.0.1:55432/spendeazy_test_db',
    });

    expect(config.invitationCodeEncryptionKey).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('preserves an explicitly configured Invite Code key', () => {
    const explicitKey = 'abcdef0123456789'.repeat(4);
    const config = loadLocalTestAppConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://spendeazy_test_user:spendeazy_local_test_password@127.0.0.1:55432/spendeazy_test_db',
      INVITATION_CODE_ENCRYPTION_KEY: explicitKey,
    });

    expect(config.invitationCodeEncryptionKey).toBe(explicitKey);
  });
});
