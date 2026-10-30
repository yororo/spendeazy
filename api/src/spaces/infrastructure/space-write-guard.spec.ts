import type { EntityManager } from 'typeorm';

import {
  SpaceNotFoundError,
  SpaceNotWritableError,
} from '../application/space-errors';
import { SpaceEntity } from '../../database/entities/space.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { lockWritableSpace, prepareWritableSpace } from './space-write-guard';

describe('prepareWritableSpace', () => {
  function makeManager(space: Partial<SpaceEntity> | null) {
    const query = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(space),
    };
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(query),
    });
    return {
      entityManager: { getRepository } as unknown as EntityManager,
      getRepository,
      query,
    };
  }

  it('checks and returns an active Space', async () => {
    const { entityManager, getRepository, query } = makeManager({
      id: '42',
      status: 'active',
    });

    await expect(
      prepareWritableSpace(entityManager, '42'),
    ).resolves.toMatchObject({
      id: '42',
      status: 'active',
    });

    expect(getRepository).toHaveBeenCalledWith(SpaceEntity);
    expect(query.where).toHaveBeenCalledWith('space.id = :spaceId', {
      spaceId: '42',
    });
    expect(query.setLock).not.toHaveBeenCalled();
  });

  it('rejects an archived Space before mutation', async () => {
    const { entityManager, query } = makeManager({
      id: '42',
      status: 'archived',
    });

    await expect(
      prepareWritableSpace(entityManager, '42'),
    ).rejects.toBeInstanceOf(SpaceNotWritableError);
    expect(query.setLock).not.toHaveBeenCalled();
  });

  it('rejects a missing Space', async () => {
    const { entityManager } = makeManager(null);

    await expect(
      prepareWritableSpace(entityManager, '404'),
    ).rejects.toBeInstanceOf(SpaceNotFoundError);
  });

  it('locks an active Space when serializing a Space-wide revision', async () => {
    const { entityManager, query } = makeManager({
      id: '42',
      status: 'active',
    });

    await expect(lockWritableSpace(entityManager, '42')).resolves.toMatchObject(
      { id: '42', status: 'active' },
    );
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('locks the actor before reading the Space when recording actor attribution', async () => {
    const actorQuery = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: '7', deletionStatus: 'active' }),
    };
    const spaceQuery = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: '42', status: 'active' }),
    };
    const repositoryOrder: unknown[] = [];
    const entityManager = {
      getRepository: jest.fn((entity: unknown) => {
        repositoryOrder.push(entity);
        return {
          createQueryBuilder: () =>
            entity === UserEntity ? actorQuery : spaceQuery,
        };
      }),
    } as unknown as EntityManager;

    await prepareWritableSpace(entityManager, '42', '7');

    expect(repositoryOrder).toEqual([UserEntity, SpaceEntity]);
    expect(actorQuery.where).toHaveBeenCalledWith('user.id = :actorUserId', {
      actorUserId: '7',
    });
    expect(actorQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
    expect(spaceQuery.setLock).not.toHaveBeenCalled();
  });
});
