import type { EntityManager } from 'typeorm';
import { StatementImportEntity } from '../../database/entities/statement-import.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../../spaces/application/space-errors';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import type {
  StatementImportHistoryRecord,
  StatementImportRecord,
} from '../application/statement-import-store';
import { TypeOrmStatementImportStore } from './typeorm-statement-import-store';

describe('TypeOrmStatementImportStore', () => {
  it('checks current membership after locking the destination Space', async () => {
    const spaceQuery = lockedQuery({ status: 'active' });
    const membershipQuery = lockedQuery({ accessLevel: 'write' });
    const getRepository = jest.fn((entity: unknown) => ({
      createQueryBuilder: () =>
        entity === SpaceEntity ? spaceQuery : membershipQuery,
    }));
    const manager = { getRepository } as unknown as EntityManager;
    const store = new TypeOrmStatementImportStore(manager);

    await expect(
      store.lockForStatementImport('55', '7'),
    ).resolves.toBeUndefined();
    expect(getRepository).toHaveBeenCalledWith(SpaceMembershipEntity);
    expect(membershipQuery.andWhere).toHaveBeenCalledWith(
      'membership.userId = :userId',
      { userId: '7' },
    );
    expect(membershipQuery.setLock).toHaveBeenCalledWith('pessimistic_read');

    membershipQuery.getOne.mockResolvedValueOnce(null);
    await expect(
      store.lockForStatementImport('55', '7'),
    ).rejects.toBeInstanceOf(SpaceNotFoundError);
    membershipQuery.getOne.mockResolvedValueOnce({ accessLevel: 'read' });
    await expect(
      store.lockForStatementImport('55', '7'),
    ).rejects.toBeInstanceOf(SpaceNotWritableError);
    spaceQuery.getOne.mockResolvedValueOnce({ status: 'archived' });
    await expect(
      store.lockForStatementImport('55', '7'),
    ).rejects.toBeInstanceOf(SpaceNotWritableError);
  });
  it('finds a statement import only within the requested Space scope', async () => {
    const entity = statementImportEntity({ id: '108', spaceId: '42' });
    const repository = {
      findOne: jest.fn().mockResolvedValue(entity),
    };
    const store = new TypeOrmStatementImportStore(entityManagerFor(repository));

    await expect(store.findByIdInSpace('42', '108')).resolves.toEqual(
      statementImportRecord({ id: '108', spaceId: '42' }),
    );
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: '108', spaceId: '42' },
    });
  });

  it('finds a statement import only within the requested Space scope', async () => {
    const entity = statementImportEntity({
      id: '108',
      spaceId: '55',
      importedByUserId: '42',
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(entity),
    };
    const store = new TypeOrmStatementImportStore(entityManagerFor(repository));

    await expect(
      store.findByFileHashInSpace('55', entity.fileHash),
    ).resolves.toEqual(
      statementImportRecord({
        id: '108',
        spaceId: '55',
        importedByUserId: '42',
      }),
    );
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { spaceId: '55', fileHash: entity.fileHash },
    });
  });

  it('queries a stable filtered page with transaction counts and a forward-only boundary', async () => {
    const entities = [
      statementImportEntity({ id: '3', statementDate: '2026-08-03' }),
      statementImportEntity({ id: '2', statementDate: '2026-08-03' }),
    ];
    const query = statementImportPageQuery(entities, [
      { transactionCount: '12' },
      { transactionCount: '0' },
    ]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const store = new TypeOrmStatementImportStore(entityManagerFor(repository));

    await expect(
      store.findPageInSpace({
        spaceId: '7',
        filters: {
          fromDate: '2026-08-01',
          toDate: '2026-08-31',
        },
        after: { statementDate: '2026-08-15', statementImportId: '100' },
        pageSize: 2,
      }),
    ).resolves.toEqual([
      statementImportHistoryRecord({
        id: '3',
        statementDate: '2026-08-03',
        transactionCount: '12',
      }),
      statementImportHistoryRecord({
        id: '2',
        statementDate: '2026-08-03',
        transactionCount: '0',
      }),
    ]);

    expect(query.where).toHaveBeenCalledWith(
      'statementImport.spaceId = :spaceId',
      { spaceId: '7' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'statementImport.statementDate >= :fromDate',
      { fromDate: '2026-08-01' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'statementImport.statementDate <= :toDate',
      { toDate: '2026-08-31' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      '(statementImport.statementDate < :cursorDate OR (statementImport.statementDate = :cursorDate AND statementImport.id < :cursorId))',
      { cursorDate: '2026-08-15', cursorId: '100' },
    );
    expect(query.leftJoin).toHaveBeenCalledWith(
      TransactionEntity,
      'transaction',
      'transaction.statementImportId = statementImport.id AND transaction.spaceId = statementImport.spaceId AND transaction.deletedAt IS NULL',
    );
    expect(query.addSelect).toHaveBeenCalledWith(
      'COUNT(transaction.id)',
      'transactionCount',
    );
    expect(query.groupBy).toHaveBeenCalledWith('statementImport.id');
    expect(query.orderBy).toHaveBeenCalledWith(
      'statementImport.statementDate',
      'DESC',
    );
    expect(query.addOrderBy).toHaveBeenCalledWith('statementImport.id', 'DESC');
    expect(query.take).toHaveBeenCalledWith(3);
  });

  it('joins transaction counts within the requested Space', async () => {
    const entities = [statementImportEntity({ id: '3', spaceId: '55' })];
    const query = statementImportPageQuery(entities, [
      { transactionCount: '2' },
    ]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const store = new TypeOrmStatementImportStore(entityManagerFor(repository));

    await store.findPageInSpace({
      spaceId: '55',
      filters: {},
      after: null,
      pageSize: 20,
    });

    expect(query.where).toHaveBeenCalledWith(
      'statementImport.spaceId = :spaceId',
      { spaceId: '55' },
    );
    expect(query.leftJoin).toHaveBeenCalledWith(
      TransactionEntity,
      'transaction',
      'transaction.statementImportId = statementImport.id AND transaction.spaceId = statementImport.spaceId AND transaction.deletedAt IS NULL',
    );
  });
});

function lockedQuery(result: object): Record<string, jest.Mock> {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  };
}

function entityManagerFor(repository: object): EntityManager {
  return {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
}

function statementImportPageQuery(
  entities: StatementImportEntity[],
  raw: object[],
): Record<string, jest.Mock> {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
  };
}

function statementImportEntity(
  overrides: Partial<StatementImportEntity> = {},
): StatementImportEntity {
  return {
    id: '1',
    spaceId: '7',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-01',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function statementImportRecord(
  overrides: Partial<StatementImportEntity> = {},
): StatementImportRecord {
  return {
    id: '1',
    spaceId: '7',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-01',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function statementImportHistoryRecord(
  overrides: Partial<StatementImportHistoryRecord> = {},
): StatementImportHistoryRecord {
  return {
    id: '1',
    spaceId: '7',
    fileName: 'august.pdf',
    statementDate: '2026-08-01',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    transactionCount: '2',
    ...overrides,
  };
}
