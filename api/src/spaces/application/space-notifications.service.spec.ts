import type { SpaceNotificationDelivery } from './space-notification-delivery';
import type {
  SpaceNotificationRecord,
  SpaceNotificationStore,
} from './space-notification';
import { SpaceNotificationsService } from './space-notifications.service';

describe('SpaceNotificationsService', () => {
  it('retains the archive notification when email delivery fails', async () => {
    const pending = notification('pending', null);
    const failed = notification('failed', 'provider unavailable');
    const create = jest.fn().mockResolvedValue(pending);
    const updateDelivery = jest.fn().mockResolvedValue(failed);
    const store = {
      create,
      updateDelivery,
    } as unknown as SpaceNotificationStore;
    const send = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const delivery = {
      send,
    } as unknown as SpaceNotificationDelivery;
    const service = new SpaceNotificationsService(store, delivery);

    await expect(
      service.notifySharedSpaceArchived({
        spaceId: '20',
        actorUserId: '1',
        actorName: 'Ada Lovelace',
        recipient: {
          id: '2',
          name: 'Grace Hopper',
          email: 'grace@example.test',
        },
      }),
    ).resolves.toEqual(failed);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: '2',
        spaceId: '20',
        actorUserId: '1',
      }),
    );
    expect(updateDelivery).toHaveBeenCalledWith(
      '30',
      'failed',
      'provider unavailable',
    );
  });

  it('retries delivery only through a notification owned by the requesting User', async () => {
    const failed = notification('failed', 'provider unavailable');
    const sent = notification('sent', null);
    const findForUser = jest.fn().mockResolvedValue(failed);
    const findDeliveryContext = jest.fn().mockResolvedValue({
      recipient: {
        id: '2',
        name: 'Grace Hopper',
        email: 'grace@example.test',
      },
      actorName: 'Ada Lovelace',
    });
    const updateDelivery = jest.fn().mockResolvedValue(sent);
    const store = {
      findForUser,
      findDeliveryContext,
      updateDelivery,
    } as unknown as SpaceNotificationStore;
    const send = jest.fn().mockResolvedValue(undefined);
    const delivery = {
      send,
    } as unknown as SpaceNotificationDelivery;
    const service = new SpaceNotificationsService(store, delivery);

    await expect(service.retryForUser('2', '30')).resolves.toEqual(sent);

    expect(findForUser).toHaveBeenCalledWith('2', '30');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: '30',
        recipientEmail: 'grace@example.test',
      }),
    );
  });
});

function notification(
  status: SpaceNotificationRecord['emailDeliveryStatus'],
  error: string | null,
): SpaceNotificationRecord {
  return {
    id: '30',
    recipientUserId: '2',
    spaceId: '20',
    actorUserId: '1',
    type: 'shared_space_archived',
    title: 'Shared Space archived',
    message: 'Ada Lovelace ended sharing.',
    readAt: null,
    emailDeliveryStatus: status,
    emailDeliveryError: error,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
  };
}
