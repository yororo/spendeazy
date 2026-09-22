import { describe, expect, it, vi } from 'vitest';

import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  resendInvitation,
  retryInvitation,
  type InvitationsApiClient,
} from './invitations-service';

const invitation = {
  id: '42',
  recipientEmail: 'person@example.com',
  status: 'pending' as const,
  expiresAt: '2026-09-28T00:00:00.000Z',
  lastSentAt: '2026-09-21T00:00:00.000Z',
  deliveryStatus: 'sent' as const,
  deliveryError: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

const acceptedSpace = {
  id: '99',
  kind: 'shared' as const,
  status: 'active' as const,
  accessLevel: 'write' as const,
  members: [
    { id: '1', name: 'Sender' },
    { id: '2', name: 'Recipient' },
  ],
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

describe('invitations service', () => {
  it('validates the inbox projection', async () => {
    const get = vi.fn().mockResolvedValue({
      outgoing: invitation,
      incoming: [invitation],
    });

    await expect(
      getInvitations({ get } as unknown as InvitationsApiClient),
    ).resolves.toEqual({ outgoing: invitation, incoming: [invitation] });
    expect(get).toHaveBeenCalledWith('/invitations', { signal: undefined });
  });

  it('trims create input and requires the created response status', async () => {
    const post = vi.fn().mockResolvedValue(invitation);

    await expect(
      createInvitation({ post } as unknown as InvitationsApiClient, ' person@example.com '),
    ).resolves.toBe(invitation);
    expect(post).toHaveBeenCalledWith(
      '/invitations',
      { email: 'person@example.com' },
      { expectedStatuses: [201] },
    );
  });

  it('exposes lifecycle operations through their stable endpoint contracts', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const post = vi
      .fn()
      .mockResolvedValueOnce(invitation)
      .mockResolvedValueOnce(invitation)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(acceptedSpace);
    const client = { delete: del, post } as unknown as InvitationsApiClient;

    await cancelInvitation(client, '42');
    await resendInvitation(client, '42');
    await retryInvitation(client, '42');
    await declineInvitation(client, '42');
    await expect(acceptInvitation(client, '42')).resolves.toEqual(acceptedSpace);

    expect(del).toHaveBeenCalledWith('/invitations/42', {
      expectedStatuses: [204],
    });
    expect(post.mock.calls).toEqual([
      ['/invitations/42/resend', {}, { expectedStatuses: [200] }],
      ['/invitations/42/retry', {}, { expectedStatuses: [200] }],
      ['/invitations/42/decline', { confirm: true }, { expectedStatuses: [204] }],
      ['/invitations/42/accept', {}, { expectedStatuses: [200] }],
    ]);
  });

  it('rejects malformed server data instead of exposing transport records', async () => {
    const get = vi.fn().mockResolvedValue({ outgoing: null, incoming: [{}] });

    await expect(
      getInvitations({ get } as unknown as InvitationsApiClient),
    ).rejects.toThrow('invalid invitation inbox');
  });
});
