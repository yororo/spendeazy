export function parseDatabaseUrl(
  value: string | undefined,
): string | undefined {
  const databaseUrl = value?.trim();
  if (!databaseUrl) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }

  return databaseUrl;
}

export function requireDatabaseUrl(value: string | undefined): string {
  const databaseUrl = parseDatabaseUrl(value);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for TypeORM');
  }

  return databaseUrl;
}
