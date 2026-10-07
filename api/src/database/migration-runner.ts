import type { DataSource, Migration, QueryRunner } from 'typeorm';

const MIGRATION_LOCK_NAMESPACE = 0x5350454e;
const MIGRATION_LOCK_KEY = 0x4445415a;
const ACQUIRE_MIGRATION_LOCK =
  'SELECT pg_advisory_lock($1::integer, $2::integer)';
const RELEASE_MIGRATION_LOCK =
  'SELECT pg_advisory_unlock($1::integer, $2::integer)';

export async function executeDatabaseMigrations(
  dataSource: DataSource,
): Promise<Migration[]> {
  const lockRunner = dataSource.createQueryRunner();
  await lockRunner.connect();

  let migrationLockAcquired = false;
  try {
    await acquireMigrationLock(lockRunner);
    migrationLockAcquired = true;

    const migrations = await dataSource.runMigrations();
    if (await dataSource.showMigrations()) {
      throw new Error(
        'Database schema is not current after migrations completed',
      );
    }

    return migrations;
  } finally {
    try {
      if (migrationLockAcquired) {
        await releaseMigrationLock(lockRunner);
      }
    } finally {
      await lockRunner.release();
    }
  }
}

async function acquireMigrationLock(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(ACQUIRE_MIGRATION_LOCK, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_KEY,
  ]);
}

async function releaseMigrationLock(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(RELEASE_MIGRATION_LOCK, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_KEY,
  ]);
}
