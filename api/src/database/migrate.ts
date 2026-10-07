import 'reflect-metadata';
import './load-database-environment';
import { createMigrationDataSource } from './migration-data-source';
import { executeDatabaseMigrations } from './migration-runner';

async function main(): Promise<void> {
  const dataSource = createMigrationDataSource();
  try {
    await dataSource.initialize();
    const migrations = await executeDatabaseMigrations(dataSource);
    console.log(
      `Database schema is ready; ${migrations.length} pending migration(s) applied.`,
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const configuredUrl = process.env.DATABASE_URL?.trim();
  const withoutConfiguredUrl = configuredUrl
    ? message.replaceAll(configuredUrl, '[redacted DATABASE_URL]')
    : message;

  return withoutConfiguredUrl.replace(
    /postgres(?:ql)?:\/\/[^\s"'`]+/giu,
    '[redacted PostgreSQL connection URL]',
  );
}

void main().catch((error: unknown) => {
  console.error(`Database migration failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
