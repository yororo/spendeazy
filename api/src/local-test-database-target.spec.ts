import { validateLocalTestDatabaseTarget } from '../local-test/database-target';

describe('validateLocalTestDatabaseTarget', () => {
  const databaseUrl =
    'postgresql://spendeazy_test_user:spendeazy_local_test_password@127.0.0.1:55432/spendeazy_test_db';

  it('accepts the launcher-owned loopback database target', () => {
    expect(
      validateLocalTestDatabaseTarget({
        SPENDEAZY_LOCAL_TEST: '1',
        DATABASE_URL: databaseUrl,
      }),
    ).toMatchObject({
      host: '127.0.0.1',
      port: 55432,
      username: 'spendeazy_test_user',
      database: 'spendeazy_test_db',
    });
  });

  it('accepts a launcher-owned per-run target with matching credentials', () => {
    const runEnvironment = {
      SPENDEAZY_LOCAL_TEST: '1',
      SPENDEAZY_TEST_DB_PORT: '55991',
      SPENDEAZY_TEST_DB_USER: 'spendeazy_e2e_abc123abc123abcd',
      SPENDEAZY_TEST_DB_PASSWORD: 'run-specific-password',
      SPENDEAZY_TEST_DB_NAME: 'spendeazy_e2e_abc123abc123abcd',
      DATABASE_URL:
        'postgresql://spendeazy_e2e_abc123abc123abcd:run-specific-password@127.0.0.1:55991/spendeazy_e2e_abc123abc123abcd',
    };

    expect(validateLocalTestDatabaseTarget(runEnvironment)).toMatchObject({
      host: '127.0.0.1',
      port: 55991,
      username: 'spendeazy_e2e_abc123abc123abcd',
      database: 'spendeazy_e2e_abc123abc123abcd',
    });
  });

  it.each([
    ['without the launcher marker', { DATABASE_URL: databaseUrl }],
    [
      'with an ordinary development database',
      {
        SPENDEAZY_LOCAL_TEST: '1',
        DATABASE_URL:
          'postgresql://spendeazy_user:spendeazy_password@127.0.0.1:5432/spendeazydb',
      },
    ],
    [
      'with a non-loopback host',
      {
        SPENDEAZY_LOCAL_TEST: '1',
        DATABASE_URL:
          'postgresql://spendeazy_test_user:spendeazy_local_test_password@db.example.com:55432/spendeazy_test_db',
      },
    ],
  ])('rejects a target %s', (_description, environment) => {
    expect(() => validateLocalTestDatabaseTarget(environment)).toThrow(
      /dedicated launcher|dedicated loopback database/,
    );
  });

  it('rejects a URL whose credentials differ from the launcher environment', () => {
    expect(() =>
      validateLocalTestDatabaseTarget({
        SPENDEAZY_LOCAL_TEST: '1',
        SPENDEAZY_TEST_DB_PORT: '55991',
        SPENDEAZY_TEST_DB_USER: 'spendeazy_e2e_abc123abc123abcd',
        SPENDEAZY_TEST_DB_PASSWORD: 'run-specific-password',
        SPENDEAZY_TEST_DB_NAME: 'spendeazy_e2e_abc123abc123abcd',
        DATABASE_URL:
          'postgresql://spendeazy_e2e_abc123abc123abcd:other-password@127.0.0.1:55991/spendeazy_e2e_abc123abc123abcd',
      }),
    ).toThrow('dedicated loopback database');
  });
});
