import { validateLocalTestDatabaseTarget } from './database-target';

async function main(): Promise<void> {
  const target = validateLocalTestDatabaseTarget();
  const { AppDataSource } = require('../src/database/data-source') as typeof import('../src/database/data-source');

  console.log(`Migrating dedicated local test database ${target.database}`);
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Local test database migration failed: ${message}`);
  process.exitCode = 1;
});
