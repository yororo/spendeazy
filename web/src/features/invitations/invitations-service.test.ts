import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import {
  acceptInvitation,
  claimInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  revokeInvitation,
  rotateInvitation,
  requireIncomingInvitation,
  requireInvitationInbox,
} from './invitations-service';

describe('invitations service', () => {
  it('creates an Invite Code without sending a recipient address', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue(outgoingInvitation()),
    };

    await expect(createInvitation(apiClient)).resolves.toEqual(
      outgoingInvitation(),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/invitations',
      {},
      { expectedStatuses: [201] },
    );
  });

  it('loads the sender-owned outgoing code and does not require a public token', async () => {
    const apiClient = {
      get: vi.fn().mockResolvedValue({
        outgoing: outgoingInvitation(),
        incoming: [],
      }),
    };

    await expect(getInvitations(apiClient)).resolves.toEqual({
      outgoing: outgoingInvitation(),
      incoming: [],
    });
    expect(apiClient.get).toHaveBeenCalledWith('/invitations', {
      signal: undefined,
    });
  });

  it('rejects a response that would expose a malformed or missing code', () => {
    expect(() =>
      requireInvitationInbox({
        outgoing: { ...outgoingInvitation(), code: 'short' },
        incoming: [],
      }),
    ).toThrow('invalid invitation inbox');
  });

  it('preserves API errors from code creation', async () => {
    const error = new ApiError('You already have a pending Invite Code', {
      kind: 'http',
      status: 409,
      code: 'INVITATION_ALREADY_PENDING',
    });
    const apiClient = { post: vi.fn().mockRejectedValue(error) };

    await expect(createInvitation(apiClient)).rejects.toBe(error);
  });

  it('rotates the sender-owned Invite Code and validates the replacement', async () => {
    const replacement = {
      ...outgoingInvitation(),
      id: '8',
      code: '9N4P-6R8T-2V5X-7Z3B-C8D4-H6J9',
    } as const;
    const apiClient = {
      post: vi.fn().mockResolvedValue(replacement),
    };

    await expect(rotateInvitation(apiClient)).resolves.toEqual(replacement);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/invitations/rotate',
      {},
      { expectedStatuses: [200] },
    );
  });

  it('revokes the sender-owned Invite Code without expecting a body', async () => {
    const apiClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await expect(revokeInvitation(apiClient)).resolves.toBeUndefined();
    expect(apiClient.delete).toHaveBeenCalledWith('/invitations', {
      expectedStatuses: [204],
    });
  });

  it('saves an entered Invite Code and validates the incoming invitation', async () => {
    const incoming = incomingInvitation();
    const apiClient = {
      post: vi.fn().mockResolvedValue(incoming),
    };

    await expect(claimInvitation(apiClient, '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3')).resolves.toEqual(
      incoming,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/invitations/claims',
      { code: '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3' },
      { expectedStatuses: [201] },
    );
  });

  it('declines a saved invitation without expecting a response body', async () => {
    const apiClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await expect(declineInvitation(apiClient, '88')).resolves.toBeUndefined();
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/invitations/claims/88',
      { expectedStatuses: [204] },
    );
  });

  it('joins a Shared Space from a saved claim and validates the returned Space', async () => {
    const apiClient = {
      post: vi.fn().mockResolvedValue(sharedSpace()),
    };

    await expect(acceptInvitation(apiClient, '88')).resolves.toEqual(
      sharedSpace(),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/invitations/claims/88/accept',
      {},
      { expectedStatuses: [200] },
    );
  });

  it('rejects malformed incoming invitation data', () => {
    expect(() =>
      requireIncomingInvitation({
        ...incomingInvitation(),
        senderName: 42,
      }),
    ).toThrow('invalid incoming invitation');
  });
});

function outgoingInvitation() {
  return {
    id: '7',
    code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
    status: 'pending',
    expiresAt: '2026-09-30T00:00:00.000Z',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  } as const;
}

function incomingInvitation() {
  return {
    id: '88',
    senderName: 'Invite sender',
    status: 'pending',
    expiresAt: '2026-09-30T00:00:00.000Z',
    createdAt: '2026-09-23T01:00:00.000Z',
  } as const;
}

function sharedSpace() {
  return {
    id: '20',
    kind: 'shared',
    status: 'active',
    accessLevel: 'write',
    members: [
      { id: '42', name: 'Invite sender' },
      { id: '99', name: 'Invite recipient' },
    ],
    createdAt: '2026-09-23T02:00:00.000Z',
    updatedAt: '2026-09-23T02:00:00.000Z',
  } as const;
}
