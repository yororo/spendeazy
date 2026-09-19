const LOCAL_TEST_DATABASE = {
  host: '127.0.0.1',
  username: 'spendeazy_test_user',
  password: 'spendeazy_local_test_password',
  database: 'spendeazy_test_db',
} as const;

const ALLOWED_LOCAL_TEST_DATABASE_PORTS = new Set([55432, 55433]);

export interface LocalTestDatabaseTarget {
  readonly url: string;
  readonly host: typeof LOCAL_TEST_DATABASE.host;
  readonly port: number;
  readonly username: typeof LOCAL_TEST_DATABASE.username;
  readonly database: typeof LOCAL_TEST_DATABASE.database;
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
  if (
    parsedUrl.protocol !== 'postgresql:' ||
    parsedUrl.hostname !== LOCAL_TEST_DATABASE.host ||
    !ALLOWED_LOCAL_TEST_DATABASE_PORTS.has(port) ||
    decodeURIComponent(parsedUrl.username) !== LOCAL_TEST_DATABASE.username ||
    decodeURIComponent(parsedUrl.password) !== LOCAL_TEST_DATABASE.password ||
    parsedUrl.pathname !== `/${LOCAL_TEST_DATABASE.database}` ||
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
    username: LOCAL_TEST_DATABASE.username,
    database: LOCAL_TEST_DATABASE.database,
  };
}

export { ALLOWED_LOCAL_TEST_DATABASE_PORTS, LOCAL_TEST_DATABASE };
