import { AppDataSource } from '../src/database/data-source';
import { validateLocalTestDatabaseTarget } from './database-target';
import { resetLocalTestFixtures } from './fixtures';

async function main(): Promise<void> {
  const target = validateLocalTestDatabaseTarget();

  console.log(
    `Resetting the dedicated local test database ${target.database} on ${target.host}:${target.port}`,
  );
  await AppDataSource.initialize();
  try {
    await AppDataSource.dropDatabase();
    await AppDataSource.runMigrations();
    const result = await resetLocalTestFixtures(AppDataSource);
    console.log(
      `Restored ${result.counts.users} User, ${result.counts.categories} Categories, ${result.counts.budgets} Budgets, ${result.counts.categoryRules} Category Rules, and ${result.counts.transactions} Transactions`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Local test reset failed: ${message}`);
  process.exitCode = 1;
});
