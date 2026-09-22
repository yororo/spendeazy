import { describe, expect, it, vi } from 'vitest';

import {
  getSpaceNotifications,
  retrySpaceNotification,
  type SpaceNotification,
} from './space-notification';

const notification: SpaceNotification = {
  id: '30',
  spaceId: '20',
  type: 'shared_space_archived',
  title: 'Shared Space archived',
  message: 'Ada ended sharing.',
  readAt: null,
  emailDeliveryStatus: 'failed',
  emailDeliveryError:
    'provider response https://mailer.example.test/archive body=provider-secret',
  createdAt: '2026-09-22T00:00:00.000Z',
};

describe('space notification service', () => {
  it('normalizes provider details in listed delivery failures', async () => {
    const get = vi.fn().mockResolvedValue([notification]);

    await expect(getSpaceNotifications({ get })).resolves.toEqual([
      {
        ...notification,
        emailDeliveryError: 'Email delivery failed. Please retry.',
      },
    ]);
  });

  it('normalizes provider details in retried delivery failures', async () => {
    const post = vi.fn().mockResolvedValue(notification);

    await expect(retrySpaceNotification({ post }, '30')).resolves.toEqual({
      ...notification,
      emailDeliveryError: 'Email delivery failed. Please retry.',
    });
  });
});
