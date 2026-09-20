import type { AccessibleSpaceRecord, SpaceStore } from './space-store';
import { SpaceNotFoundError, SpaceNotWritableError } from './space-errors';
import { SpaceAccessService } from './space-access.service';

describe('SpaceAccessService', () => {
  it('lists only the Spaces returned for the authenticated local User', async () => {
    const store = new SpaceStoreFake([
      spaceRecord({ id: '10', userId: '42', accessLevel: 'write' }),
    ]);
    const service = new SpaceAccessService(store);

    await expect(service.listAccessibleSpaces('42')).resolves.toEqual([
      expect.objectContaining({ id: '10', accessLevel: 'write' }),
    ]);
    expect(store.listAccessibleCalls).toEqual(['42']);
  });

  it('requires read access through the authenticated User and Space identifier', async () => {
    const store = new SpaceStoreFake([
      spaceRecord({ id: '10', userId: '42', accessLevel: 'read' }),
    ]);
    const service = new SpaceAccessService(store);

    await expect(service.requireReadAccess('42', '10')).resolves.toMatchObject({
      id: '10',
      accessLevel: 'read',
    });
    await expect(service.requireReadAccess('99', '10')).rejects.toBeInstanceOf(
      SpaceNotFoundError,
    );
    expect(store.findAccessibleCalls).toEqual([
      { userId: '42', spaceId: '10' },
      { userId: '99', spaceId: '10' },
    ]);
  });

  it('distinguishes writable membership from read-only membership', async () => {
    const store = new SpaceStoreFake([
      spaceRecord({ id: '10', userId: '42', accessLevel: 'read' }),
      spaceRecord({ id: '11', userId: '42', accessLevel: 'write' }),
      spaceRecord({
        id: '12',
        userId: '42',
        status: 'archived',
        accessLevel: 'write',
      }),
    ]);
    const service = new SpaceAccessService(store);

    await expect(service.requireWriteAccess('42', '11')).resolves.toMatchObject(
      {
        id: '11',
        accessLevel: 'write',
      },
    );
    await expect(service.requireWriteAccess('42', '10')).rejects.toBeInstanceOf(
      SpaceNotWritableError,
    );
    await expect(service.requireWriteAccess('42', '12')).rejects.toBeInstanceOf(
      SpaceNotWritableError,
    );
  });

  it('grants equal Shared Space access to both members and denies a third User', async () => {
    const store = new SpaceStoreFake([
      spaceRecord({
        id: '20',
        kind: 'shared',
        userId: '42',
        accessLevel: 'write',
      }),
      spaceRecord({
        id: '20',
        kind: 'shared',
        userId: '43',
        accessLevel: 'write',
      }),
    ]);
    const service = new SpaceAccessService(store);

    await expect(service.requireWriteAccess('42', '20')).resolves.toMatchObject(
      { id: '20', accessLevel: 'write' },
    );
    await expect(service.requireWriteAccess('43', '20')).resolves.toMatchObject(
      { id: '20', accessLevel: 'write' },
    );
    await expect(service.requireReadAccess('99', '20')).rejects.toBeInstanceOf(
      SpaceNotFoundError,
    );
  });
});

class SpaceStoreFake implements SpaceStore {
  readonly listAccessibleCalls: string[] = [];
  readonly findAccessibleCalls: Array<{
    userId: string;
    spaceId: string;
  }> = [];

  constructor(private readonly spaces: readonly AccessibleSpaceRecord[]) {}

  listAccessible(userId: string): Promise<AccessibleSpaceRecord[]> {
    this.listAccessibleCalls.push(userId);
    return Promise.resolve(
      this.spaces.filter((space) => space.userId === userId),
    );
  }

  findAccessible(
    userId: string,
    spaceId: string,
  ): Promise<AccessibleSpaceRecord | null> {
    this.findAccessibleCalls.push({ userId, spaceId });
    return Promise.resolve(
      this.spaces.find(
        (space) => space.userId === userId && space.id === spaceId,
      ) ?? null,
    );
  }
}

function spaceRecord(
  overrides: Partial<AccessibleSpaceRecord> = {},
): AccessibleSpaceRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '1',
    kind: 'personal',
    status: 'active',
    userId: '42',
    accessLevel: 'write',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
