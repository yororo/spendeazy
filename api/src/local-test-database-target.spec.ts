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
});
