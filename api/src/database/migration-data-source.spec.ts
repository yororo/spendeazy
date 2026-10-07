import { createMigrationDataSource } from './migration-data-source';

describe('createMigrationDataSource', () => {
  it('configures the production migration set from DATABASE_URL alone', () => {
    const dataSource = createMigrationDataSource({
      DATABASE_URL:
        'postgresql://migration-user:secret@db.example.com/expenses',
    });

    expect(dataSource.options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://migration-user:secret@db.example.com/expenses',
      migrationsTableName: 'typeorm_migrations',
      migrationsTransactionMode: 'all',
      migrationsRun: false,
      synchronize: false,
    });
    expect(dataSource.options.entities).toBeUndefined();
    expect(dataSource.options.migrations).toHaveLength(25);
  });

  it('rejects a missing or invalid database URL before connecting', () => {
    expect(() => createMigrationDataSource({})).toThrow(
      'DATABASE_URL is required for TypeORM',
    );
    expect(() =>
      createMigrationDataSource({
        DATABASE_URL: 'mysql://db.example.com/expenses',
      }),
    ).toThrow('DATABASE_URL must be a PostgreSQL connection URL');
  });
});
