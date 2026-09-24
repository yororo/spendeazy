import type {
  SpaceNotificationRecord,
  SpaceNotificationStore,
} from './space-notification';
import { SpaceNotificationsService } from './space-notifications.service';

describe('SpaceNotificationsService', () => {
  it('persists an archive notification for the other member without email delivery', async () => {
    const created = notification();
    const create = jest.fn().mockResolvedValue(created);
    const store = { create } as unknown as SpaceNotificationStore;
    const service = new SpaceNotificationsService(store);

    await expect(
      service.notifySharedSpaceArchived({
        spaceId: '20',
        actorUserId: '1',
        actorName: 'Ada Lovelace',
        recipient: { id: '2', name: 'Grace Hopper' },
      }),
    ).resolves.toEqual(created);

    expect(create).toHaveBeenCalledWith({
      recipientUserId: '2',
      spaceId: '20',
      actorUserId: '1',
      type: 'shared_space_archived',
      title: 'Shared Space archived',
      message:
        'Ada Lovelace ended sharing. This Shared Space is now permanent read-only history for both former members.',
    });
  });

  it('returns persisted notifications and preserves their read state', async () => {
    const readAt = new Date('2026-09-22T00:01:00.000Z');
    const listed = notification();
    const markedRead = { ...listed, readAt };
    const listForUser = jest.fn().mockResolvedValue([listed]);
    const markRead = jest.fn().mockResolvedValue(markedRead);
    const store = {
      listForUser,
      markRead,
    } as unknown as SpaceNotificationStore;
    const service = new SpaceNotificationsService(store);

    await expect(service.listForUser('2')).resolves.toEqual([listed]);
    await expect(service.markRead('2', '30', readAt)).resolves.toEqual(
      markedRead,
    );
    expect(listForUser).toHaveBeenCalledWith('2');
    expect(markRead).toHaveBeenCalledWith('2', '30', readAt);
  });
});

function notification(): SpaceNotificationRecord {
  return {
    id: '30',
    recipientUserId: '2',
    spaceId: '20',
    actorUserId: '1',
    type: 'shared_space_archived',
    title: 'Shared Space archived',
    message: 'Ada Lovelace ended sharing.',
    readAt: null,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
  };
}
