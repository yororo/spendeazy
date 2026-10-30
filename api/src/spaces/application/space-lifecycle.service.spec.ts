import type {
  ArchivedSpaceRecord,
  SpaceLifecycleStore,
} from './space-lifecycle-store';
import { SpaceLifecycleService } from './space-lifecycle.service';
import type { SpaceNotificationsService } from './space-notifications.service';

describe('SpaceLifecycleService', () => {
  it('archives the Shared Space and notifies the remaining member', async () => {
    const archived = archivedSpace();
    const archiveSharedSpace = jest.fn().mockResolvedValue(archived);
    const deleteIdentity = jest.fn();
    const store = {
      archiveSharedSpace,
      deleteIdentity,
    } as unknown as SpaceLifecycleStore;
    const notifySharedSpaceArchived = jest
      .fn()
      .mockResolvedValue(notification());
    const notifications = {
      notifySharedSpaceArchived,
    } as unknown as SpaceNotificationsService;
    const service = new SpaceLifecycleService(store, notifications);

    await service.leaveSharedSpace('1', '20');

    expect(archiveSharedSpace).toHaveBeenCalledWith(
      '1',
      '20',
      expect.any(Date),
    );
    expect(notifySharedSpaceArchived).toHaveBeenCalledWith({
      spaceId: '20',
      actorUserId: '1',
      actorName: 'Ada Lovelace',
      recipient: { id: '2', name: 'Grace Hopper' },
    });
  });
});

function archivedSpace(): ArchivedSpaceRecord {
  return {
    spaceId: '20',
    actorUserId: '1',
    archivedAt: new Date('2026-09-22T00:00:00.000Z'),
    members: [
      { id: '1', name: 'Ada Lovelace' },
      { id: '2', name: 'Grace Hopper' },
    ],
  };
}

function notification(): ReturnType<typeof notificationRecord> {
  return notificationRecord();
}

function notificationRecord() {
  return {
    id: '30',
    recipientUserId: '2',
    spaceId: '20',
    actorUserId: '1',
    type: 'shared_space_archived' as const,
    title: 'Shared Space archived',
    message: 'The Shared Space is now read-only history.',
    readAt: null,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
  };
}
