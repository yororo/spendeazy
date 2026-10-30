import type { DataSource, EntityManager } from 'typeorm';
import { TypeOrmStatementImportDetailStore } from './typeorm-statement-import-detail-store';

describe('committed detail read projection', () => {
  it('does not read evidence or financial projections for an import outside the requested Space', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const query = jest.fn().mockResolvedValue(undefined);
    const manager = {
      query,
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as EntityManager;
    const transaction = jest.fn(
      async (
        _isolation: string,
        read: (manager: EntityManager) => Promise<unknown>,
      ) => read(manager),
    );
    const store = new TypeOrmStatementImportDetailStore({
      transaction,
    } as unknown as DataSource);
    await expect(store.read('7', '18')).resolves.toBeNull();
    expect(transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(query).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ where: { spaceId: '7', id: '18' } });
  });
});
