import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_POSTGRES_TEST_DATABASES = [
  'TEST_SPACES_DATABASE_URL',
  'TEST_CATEGORY_RULES_DATABASE_URL',
  'TEST_CATEGORY_COLOR_DATABASE_URL',
  'TEST_SPACE_CATEGORIES_CONCURRENCY_DATABASE_URL',
  'TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL',
  'TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL',
  'TEST_TRANSACTION_STATEMENT_IMPORT_SPACE_DATABASE_URL',
  'TEST_STATEMENT_CATEGORY_SUGGESTIONS_DATABASE_URL',
  'TEST_INVITATIONS_DATABASE_URL',
  'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL',
];

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function missingPostgresTestDatabases(environment) {
  return REQUIRED_POSTGRES_TEST_DATABASES.filter((name) => !environment[name]?.trim());
}

export function duplicatePostgresTestDatabaseUrls(environment) {
  const databaseVariablesByTarget = new Map();
  const duplicates = new Set();
  for (const name of REQUIRED_POSTGRES_TEST_DATABASES) {
    const value = environment[name]?.trim();
    if (!value) continue;
    const url = new URL(value);
    const protocol = url.protocol === 'postgresql:' ? 'postgres:' : url.protocol;
    const port = url.port || (protocol === 'postgres:' ? '5432' : '');
    const database = decodeURIComponent(url.pathname);
    const target = `${protocol}//${url.hostname.toLowerCase()}:${port}${database}`;
    const existing = databaseVariablesByTarget.get(target);
    if (existing) {
      duplicates.add(existing);
      duplicates.add(name);
    } else {
      databaseVariablesByTarget.set(target, name);
    }
  }
  return [...duplicates];
}

export function createPostgresTestEnvironment({ host, port, user, password, databases, migrationDatabase }) {
  const suiteVariables = REQUIRED_POSTGRES_TEST_DATABASES.filter(
    (name) => name !== 'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL',
  );
  const missing = suiteVariables.filter((name) => !databases?.[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Every integration suite requires its own database name: ${missing.join(', ')}`);
  }

  const allNames = [...suiteVariables.map((name) => databases[name]), migrationDatabase];
  if (new Set(allNames).size !== allNames.length) {
    throw new Error('PostgreSQL integration tests require a separate database per suite and migration history.');
  }

  const migrationUrl = postgresUrl({ host, port, user, password, database: migrationDatabase });
  return Object.fromEntries(REQUIRED_POSTGRES_TEST_DATABASES.map((name) => [
    name,
    name === 'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL'
      ? migrationUrl
      : postgresUrl({ host, port, user, password, database: databases[name] }),
  ]));
}

function postgresUrl({ host, port, user, password, database }) {
  const username = encodeURIComponent(user);
  const secret = encodeURIComponent(password);
  const databaseName = encodeURIComponent(database);
  return `postgres://${username}:${secret}@${host}:${port}/${databaseName}`;
}

function main() {
  const missing = missingPostgresTestDatabases(process.env);
  if (missing.length > 0) {
    throw new Error(`PostgreSQL integration tests require all database URLs; missing: ${missing.join(', ')}`);
  }
  const duplicateDatabases = duplicatePostgresTestDatabaseUrls(process.env);
  if (duplicateDatabases.length > 0) {
    throw new Error(`PostgreSQL integration tests require a separate database per suite; duplicated targets: ${duplicateDatabases.join(', ')}`);
  }

  const jestPath = resolve(apiDirectory, 'node_modules/jest/bin/jest.js');
  const result = spawnSync(process.execPath, [jestPath, '--config', './test/jest-e2e.json', '--runInBand'], {
    cwd: apiDirectory,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
