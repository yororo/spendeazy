import type { DataSource, QueryRunner } from 'typeorm';

import { executeDatabaseMigrations } from './migration-runner';

describe('executeDatabaseMigrations', () => {
  it('serializes migration runs and confirms the schema is current before succeeding', async () => {
    const operations: string[] = [];
    const queryRunner = createQueryRunner(operations);
    const dataSource = {
      createQueryRunner: () => queryRunner,
      runMigrations: jest.fn(() => {
        operations.push('migrate');
        return Promise.resolve([]);
      }),
      showMigrations: jest.fn(() => {
        operations.push('check-pending');
        return Promise.resolve(false);
      }),
    } as unknown as DataSource;

    await expect(executeDatabaseMigrations(dataSource)).resolves.toEqual([]);

    expect(operations).toEqual([
      'connect',
      'lock',
      'migrate',
      'check-pending',
      'unlock',
      'release',
    ]);
  });

  it('fails when registered migrations remain pending and still releases the lock', async () => {
    const operations: string[] = [];
    const queryRunner = createQueryRunner(operations);
    const dataSource = {
      createQueryRunner: () => queryRunner,
      runMigrations: jest.fn(() => {
        operations.push('migrate');
        return Promise.resolve([]);
      }),
      showMigrations: jest.fn(() => Promise.resolve(true)),
    } as unknown as DataSource;

    await expect(executeDatabaseMigrations(dataSource)).rejects.toThrow(
      'Database schema is not current after migrations completed',
    );

    expect(operations.slice(-2)).toEqual(['unlock', 'release']);
  });

  it('releases the database lock when migration execution fails', async () => {
    const operations: string[] = [];
    const queryRunner = createQueryRunner(operations);
    const dataSource = {
      createQueryRunner: () => queryRunner,
      runMigrations: jest.fn(() => {
        operations.push('migrate');
        return Promise.reject(new Error('migration failed'));
      }),
      showMigrations: jest.fn(() => Promise.resolve(false)),
    } as unknown as DataSource;

    await expect(executeDatabaseMigrations(dataSource)).rejects.toThrow(
      'migration failed',
    );

    expect(operations.slice(-2)).toEqual(['unlock', 'release']);
  });
});

function createQueryRunner(operations: string[]): QueryRunner {
  return {
    connect: jest.fn(() => {
      operations.push('connect');
      return Promise.resolve();
    }),
    query: jest.fn((statement: string) => {
      operations.push(
        statement.includes('pg_advisory_lock(') ? 'lock' : 'unlock',
      );
      return Promise.resolve([]);
    }),
    release: jest.fn(() => {
      operations.push('release');
      return Promise.resolve();
    }),
  } as unknown as QueryRunner;
}
