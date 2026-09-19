import type { DataSource, EntityManager } from 'typeorm';
import { TypeOrmStatementImportConfirmationUnitOfWork } from './unit-of-work';

describe('TypeOrmStatementImportConfirmationUnitOfWork', () => {
  it('executes confirmation work in one transaction without exposing the manager', async () => {
    const entityManager = {} as EntityManager;
    const expectedResult = { imported: true };
    const transaction = jest.fn(
      (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(entityManager),
    );
    const dataSource = { transaction } as unknown as DataSource;
    const unitOfWork = new TypeOrmStatementImportConfirmationUnitOfWork(
      dataSource,
    );

    await expect(
      unitOfWork.execute((context) => {
        expect(context).not.toHaveProperty('entityManager');
        expect(Object.keys(context).sort()).toEqual([
          'categories',
          'importedTransactions',
          'statementImports',
          'users',
        ]);
        return Promise.resolve(expectedResult);
      }),
    ).resolves.toBe(expectedResult);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
