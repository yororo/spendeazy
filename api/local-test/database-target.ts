const LOCAL_TEST_DATABASE = {
  host: '127.0.0.1',
  username: 'spendeazy_test_user',
  password: 'spendeazy_local_test_password',
  database: 'spendeazy_test_db',
} as const;

const DEFAULT_LOCAL_TEST_DATABASE_PORT = 55432;
const MIN_LOCAL_TEST_DATABASE_PORT = 55432;
const MAX_LOCAL_TEST_DATABASE_PORT = 59999;
const LOCAL_TEST_DATABASE_NAME_PATTERN =
  /^(?:spendeazy_test_db|spendeazy_e2e_[a-f0-9]{16})$/;
const LOCAL_TEST_DATABASE_USER_PATTERN =
  /^(?:spendeazy_test_user|spendeazy_e2e_[a-f0-9]{16})$/;
const ALLOWED_LOCAL_TEST_DATABASE_PORTS = new Set([
  DEFAULT_LOCAL_TEST_DATABASE_PORT,
  55433,
]);

export interface LocalTestDatabaseTarget {
  readonly url: string;
  readonly host: typeof LOCAL_TEST_DATABASE.host;
  readonly port: number;
  readonly username: string;
  readonly database: string;
}

export function validateLocalTestDatabaseTarget(
  environment: NodeJS.ProcessEnv = process.env,
): LocalTestDatabaseTarget {
  if (environment.SPENDEAZY_LOCAL_TEST !== '1') {
    throw new Error('The local test database requires the dedicated launcher');
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('The local test database URL is required');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('The local test database URL is invalid');
  }

  const port = parsedUrl.port ? Number(parsedUrl.port) : 5432;
  const expectedPort = readExpectedPort(environment);
  const expectedUsername =
    environment.SPENDEAZY_TEST_DB_USER?.trim() || LOCAL_TEST_DATABASE.username;
  const expectedPassword =
    environment.SPENDEAZY_TEST_DB_PASSWORD?.trim() ||
    LOCAL_TEST_DATABASE.password;
  const expectedDatabase =
    environment.SPENDEAZY_TEST_DB_NAME?.trim() || LOCAL_TEST_DATABASE.database;
  if (
    parsedUrl.protocol !== 'postgresql:' ||
    parsedUrl.hostname !== LOCAL_TEST_DATABASE.host ||
    !isAllowedLocalTestDatabasePort(port) ||
    port !== expectedPort ||
    !LOCAL_TEST_DATABASE_USER_PATTERN.test(expectedUsername) ||
    !LOCAL_TEST_DATABASE_NAME_PATTERN.test(expectedDatabase) ||
    decodeURIComponent(parsedUrl.username) !== expectedUsername ||
    decodeURIComponent(parsedUrl.password) !== expectedPassword ||
    parsedUrl.pathname !== `/${expectedDatabase}` ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0
  ) {
    throw new Error(
      'The local test database target is not the dedicated loopback database',
    );
  }

  return {
    url: databaseUrl,
    host: LOCAL_TEST_DATABASE.host,
    port,
    username: expectedUsername,
    database: expectedDatabase,
  };
}

function readExpectedPort(environment: NodeJS.ProcessEnv): number {
  const configuredPort = environment.SPENDEAZY_TEST_DB_PORT?.trim();
  if (!configuredPort) return DEFAULT_LOCAL_TEST_DATABASE_PORT;

  const port = Number(configuredPort);
  if (!Number.isInteger(port)) {
    throw new Error('The local test database port is invalid');
  }

  return port;
}

function isAllowedLocalTestDatabasePort(port: number): boolean {
  return (
    ALLOWED_LOCAL_TEST_DATABASE_PORTS.has(port) ||
    (port >= MIN_LOCAL_TEST_DATABASE_PORT &&
      port <= MAX_LOCAL_TEST_DATABASE_PORT)
  );
}

export {
  ALLOWED_LOCAL_TEST_DATABASE_PORTS,
  LOCAL_TEST_DATABASE,
  MAX_LOCAL_TEST_DATABASE_PORT,
  MIN_LOCAL_TEST_DATABASE_PORT,
};
