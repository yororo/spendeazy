import { describe, expect, it, vi } from 'vitest';

import {
  getSpaceNotifications,
  markSpaceNotificationRead,
  type SpaceNotification,
} from './space-notification';

const notification: SpaceNotification = {
  id: '30',
  spaceId: '20',
  type: 'shared_space_archived',
  title: 'Shared Space archived',
  message: 'Ada ended sharing.',
  readAt: null,
  createdAt: '2026-09-22T00:00:00.000Z',
};

describe('space notification service', () => {
  it('accepts the in-app archive notification contract without email fields', async () => {
    const get = vi.fn().mockResolvedValue([notification]);

    await expect(getSpaceNotifications({ get })).resolves.toEqual([
      notification,
    ]);
  });

  it('marks a persisted archive notification as read', async () => {
    const markedRead = {
      ...notification,
      readAt: '2026-09-22T00:01:00.000Z',
    };
    const post = vi.fn().mockResolvedValue(markedRead);

    await expect(markSpaceNotificationRead({ post }, '30')).resolves.toEqual(
      markedRead,
    );
    expect(post).toHaveBeenCalledWith(
      '/notifications/30/read',
      {},
      { expectedStatuses: [200] },
    );
  });

  it.each([
    ['a non-UTC creation timestamp', { createdAt: '2026-09-22T00:00:00.000+00:00' }],
    ['an impossible read timestamp', { readAt: '2026-02-30T00:00:00.000Z' }],
    ['a non-string read timestamp', { readAt: 0 }],
  ] as const)('rejects %s', async (_, override) => {
    const get = vi.fn().mockResolvedValue([{ ...notification, ...override }]);

    await expect(getSpaceNotifications({ get })).rejects.toMatchObject({
      kind: 'malformed-response',
    });
  });
});
