import { DataSource } from 'typeorm';
import { requireDatabaseUrl } from '../config/database-url';
import { createMigrationTypeOrmOptions } from './database-options';

interface MigrationEnvironment {
  DATABASE_URL?: string;
}

export function createMigrationDataSource(
  environment: MigrationEnvironment = process.env,
): DataSource {
  const databaseUrl = requireDatabaseUrl(environment.DATABASE_URL);
  return new DataSource(createMigrationTypeOrmOptions(databaseUrl));
}
