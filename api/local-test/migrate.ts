import { AppDataSource } from '../src/database/data-source';
import { validateLocalTestDatabaseTarget } from './database-target';
import { ensureLocalTestFixtures } from './fixtures';
import { createLocalTestClock } from './clock';

async function main(): Promise<void> {
  const target = validateLocalTestDatabaseTarget();

  console.log(`Migrating dedicated local test database ${target.database}`);
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
    if (process.env.SPENDEAZY_LOCAL_TEST_SEED_FIXTURES === '0') {
      console.log(
        'Preserved a fresh local test database for provisioning checks',
      );
      return;
    }

    const result = await ensureLocalTestFixtures(
      AppDataSource,
      createLocalTestClock().date(),
    );
    if (result.seeded) {
      console.log(
        `Created ${result.counts.users} User, ${result.counts.categories} Categories, ${result.counts.budgets} Budgets, ${result.counts.categoryRules} Category Rules, and ${result.counts.transactions} Transactions for the fictional local test scenario`,
      );
    } else {
      console.log('Preserved existing local test data');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Local test database migration failed: ${message}`);
  process.exitCode = 1;
});
