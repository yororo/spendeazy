import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_POSTGRES_TEST_DATABASES,
  createPostgresTestEnvironment,
  duplicatePostgresTestDatabaseUrls,
  missingPostgresTestDatabases,
} from './run-required-postgres-tests.mjs';

test('the required PostgreSQL command reports every missing database instead of silently skipping suites', () => {
  assert.deepEqual(missingPostgresTestDatabases({}), REQUIRED_POSTGRES_TEST_DATABASES);
  const environment = Object.fromEntries(REQUIRED_POSTGRES_TEST_DATABASES.map((name) => [name, 'postgres://test/db']));
  delete environment.TEST_INVITATIONS_DATABASE_URL;
  assert.deepEqual(missingPostgresTestDatabases(environment), ['TEST_INVITATIONS_DATABASE_URL']);
  environment.TEST_INVITATIONS_DATABASE_URL = ' postgres://test/db ';
  assert.deepEqual(missingPostgresTestDatabases(environment), []);
});

test('integration suite URLs cannot share the same PostgreSQL database', () => {
  const environment = Object.fromEntries(REQUIRED_POSTGRES_TEST_DATABASES.map((name, index) => [
    name,
    `postgres://test@localhost:5432/suite_${index}`,
  ]));
  environment.TEST_INVITATIONS_DATABASE_URL = environment.TEST_SPACES_DATABASE_URL;
  assert.deepEqual(duplicatePostgresTestDatabaseUrls(environment), [
    'TEST_SPACES_DATABASE_URL',
    'TEST_INVITATIONS_DATABASE_URL',
  ]);
});

test('duplicate database targets are detected across default ports and credentials', () => {
  const environment = Object.fromEntries(REQUIRED_POSTGRES_TEST_DATABASES.map((name, index) => [
    name,
    `postgres://test@localhost:5432/suite_${index}`,
  ]));
  environment.TEST_SPACES_DATABASE_URL = 'postgres://first@LOCALHOST/spaces';
  environment.TEST_INVITATIONS_DATABASE_URL = 'postgresql://second@localhost:5432/spaces';

  assert.deepEqual(duplicatePostgresTestDatabaseUrls(environment), [
    'TEST_SPACES_DATABASE_URL',
    'TEST_INVITATIONS_DATABASE_URL',
  ]);
});

test('one disposable PostgreSQL service provides a separate database to every suite', () => {
  const suiteDatabases = Object.fromEntries(
    REQUIRED_POSTGRES_TEST_DATABASES
      .filter((name) => name !== 'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL')
      .map((name, index) => [name, `spendeazy_test_${index}`]),
  );
  const environment = createPostgresTestEnvironment({
    host: '127.0.0.1',
    port: 55432,
    user: 'isolated-test',
    password: 'one-run-only',
    databases: suiteDatabases,
    migrationDatabase: 'spendeazy_legacy_migration_test',
  });

  assert.deepEqual(Object.keys(environment).sort(), [...REQUIRED_POSTGRES_TEST_DATABASES].sort());
  const suiteUrls = REQUIRED_POSTGRES_TEST_DATABASES
    .filter((name) => name !== 'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL')
    .map((name) => new URL(environment[name]));
  assert.equal(new Set(suiteUrls.map((url) => url.pathname)).size, suiteUrls.length);
  for (const [name, database] of Object.entries(suiteDatabases)) {
    assert.equal(new URL(environment[name]).pathname, `/${database}`);
  }
  assert.equal(new URL(environment.TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL).pathname, '/spendeazy_legacy_migration_test');
  assert.throws(() => createPostgresTestEnvironment({
    host: '127.0.0.1',
    port: 55432,
    user: 'isolated-test',
    password: 'one-run-only',
    databases: { ...suiteDatabases, TEST_INVITATIONS_DATABASE_URL: 'spendeazy_test_0' },
    migrationDatabase: 'spendeazy_legacy_migration_test',
  }), /separate database per suite/);
});
