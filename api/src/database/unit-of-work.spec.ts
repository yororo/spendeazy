import type { DataSource, EntityManager } from 'typeorm';
import { createTransactionContext, TypeOrmUnitOfWork } from './unit-of-work';
import { TypeOrmStatementImportStore } from '../statement-imports/infrastructure/typeorm-statement-import-store';
import { TypeOrmImportedTransactionStore } from '../transactions/infrastructure/typeorm-imported-transaction-store';

describe('TypeOrmUnitOfWork', () => {
  it('constructs a transaction context around the supplied manager', () => {
    const entityManager = {} as EntityManager;

    const context = createTransactionContext(entityManager);

    expect(context.entityManager).toBe(entityManager);
    expect(
      (context.statementImports as TypeOrmStatementImportStore).entityManager,
    ).toBe(entityManager);
    expect(
      (context.importedTransactions as TypeOrmImportedTransactionStore)
        .entityManager,
    ).toBe(entityManager);
  });

  it('delegates work to one transaction-bound manager and returns its result', async () => {
    const entityManager = {} as EntityManager;
    const expectedResult = { imported: true };
    const transaction = jest.fn(
      (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(entityManager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const unitOfWork = new TypeOrmUnitOfWork(dataSource);

    await expect(
      unitOfWork.execute((context) => {
        expect(context.entityManager).toBe(entityManager);
        return Promise.resolve(expectedResult);
      }),
    ).resolves.toBe(expectedResult);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
