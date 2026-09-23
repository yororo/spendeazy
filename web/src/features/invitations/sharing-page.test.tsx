// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharingPage } from './sharing-page';
import type { SpaceNotification } from './space-notification';
import type { InvitationInbox } from './invitations-service';

const pageState = vi.hoisted(() => ({
  notificationsQuery: {
    data: [] as SpaceNotification[],
    error: null as Error | null,
    isError: false,
    isPending: false,
  },
  invitationsQuery: {
    data: { outgoing: null, incoming: [] } as InvitationInbox,
    error: null as Error | null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  },
  createMutation: {
    error: null as Error | null,
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  },
  claimMutation: {
    error: null as Error | null,
    isPending: false,
    mutate: vi.fn(),
  },
  declineMutation: {
    error: null as Error | null,
    isPending: false,
    mutate: vi.fn(),
  },
  spacesQuery: {
    data: [] as Array<{
      id: string;
      kind: 'personal' | 'shared';
      status: 'active' | 'archived';
      accessLevel: 'read' | 'write';
    }>,
  },
  leaveMutation: {
    error: null as Error | null,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/shared/api', () => ({
  normalizeEmailDeliveryFailure: (error: string | null) =>
    error === null ? null : 'Email delivery failed. Please retry.',
  useAccessibleSpacesQuery: () => pageState.spacesQuery,
  useLeaveSharedSpaceMutation: () => pageState.leaveMutation,
}));

vi.mock('./invitation-queries', () => ({
  useClaimInvitationMutation: () => pageState.claimMutation,
  useCreateInvitationMutation: () => pageState.createMutation,
  useDeclineInvitationMutation: () => pageState.declineMutation,
  useInvitationsQuery: () => pageState.invitationsQuery,
}));

vi.mock('./space-notification-queries', () => ({
  useMarkSpaceNotificationReadMutation: () => basicMutation(),
  useRetrySpaceNotificationMutation: () => basicMutation(),
  useSpaceNotificationsQuery: () => pageState.notificationsQuery,
}));

afterEach(() => {
  cleanup();
  pageState.notificationsQuery.data = [];
  pageState.notificationsQuery.error = null;
  pageState.notificationsQuery.isError = false;
  pageState.notificationsQuery.isPending = false;
  pageState.invitationsQuery.data = { outgoing: null, incoming: [] };
  pageState.invitationsQuery.error = null;
  pageState.invitationsQuery.isError = false;
  pageState.invitationsQuery.isPending = false;
  pageState.invitationsQuery.refetch.mockClear();
  pageState.createMutation.error = null;
  pageState.createMutation.isError = false;
  pageState.createMutation.isPending = false;
  pageState.createMutation.mutate.mockClear();
  pageState.claimMutation.error = null;
  pageState.claimMutation.isPending = false;
  pageState.claimMutation.mutate.mockClear();
  pageState.declineMutation.error = null;
  pageState.declineMutation.isPending = false;
  pageState.declineMutation.mutate.mockClear();
  pageState.spacesQuery.data = [];
  pageState.leaveMutation.error = null;
  pageState.leaveMutation.isPending = false;
  pageState.leaveMutation.mutate.mockClear();
  pageState.leaveMutation.reset.mockClear();
});

describe('SharingPage', () => {
  it('creates a code without asking for a recipient email', () => {
    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Create a Shared Space Invite Code',
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Create Invite Code' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create Invite Code' }));
    expect(pageState.createMutation.mutate).toHaveBeenCalledWith(undefined);
  });

  it('shows the sender-owned code, expiry, and copy action on later visits', async () => {
    pageState.invitationsQuery.data = {
      outgoing: {
        id: '7',
        code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
        status: 'pending',
        expiresAt: '2026-09-30T00:00:00.000Z',
        createdAt: '2026-09-23T00:00:00.000Z',
        updatedAt: '2026-09-23T00:00:00.000Z',
      },
      incoming: [],
    };
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3')).toBeTruthy();
    expect(screen.getByText(/Expires/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Invite Code' }));
    await vi.waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
      ),
    );
  });

  it('does not offer code creation to a User in an active Shared Space', () => {
    pageState.spacesQuery.data = [
      { id: '99', kind: 'shared', status: 'active', accessLevel: 'write' },
    ];

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByText(/already belong to an active Shared Space/u),
    ).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Create Invite Code' }),
    ).toBeNull();
  });

  it('saves an Invite Code without joining a Shared Space', () => {
    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Invite Code'), {
      target: { value: '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Invitation' }));

    expect(pageState.claimMutation.mutate).toHaveBeenCalledWith(
      '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3',
    );
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
  });

  it('shows each saved incoming invitation with its sender and a scoped decline action', () => {
    pageState.invitationsQuery.data = {
      outgoing: null,
      incoming: [
        {
          id: '88',
          senderName: 'Invite sender',
          status: 'pending',
          expiresAt: '2026-09-30T00:00:00.000Z',
          createdAt: '2026-09-23T01:00:00.000Z',
        },
        {
          id: '89',
          senderName: 'Another sender',
          status: 'pending',
          expiresAt: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-09-23T02:00:00.000Z',
        },
      ],
    };

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Invite sender')).toBeTruthy();
    expect(screen.getByText('Another sender')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Decline' })[0]);
    expect(pageState.declineMutation.mutate).toHaveBeenCalledWith('88');
  });

  it('shows generic code-entry errors without replacing the saved invitation list', () => {
    pageState.claimMutation.error = new Error(
      'Invite Code is unavailable. Ask the sender for a current code.',
    );
    pageState.invitationsQuery.data = {
      outgoing: null,
      incoming: [],
    };

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Invite Code could not be saved')).toBeTruthy();
    expect(
      screen.getByText(/Ask the sender for a current code/u),
    ).toBeTruthy();
    expect(screen.getByLabelText('Invite Code')).toBeTruthy();
  });

  it('keeps archive notification delivery and read controls available', () => {
    pageState.notificationsQuery.data = [
      {
        id: '45',
        spaceId: '99',
        type: 'shared_space_archived',
        title: 'Shared Space archived',
        message: 'Ada ended sharing.',
        readAt: null,
        emailDeliveryStatus: 'failed',
        emailDeliveryError:
          'provider response https://mailer.example.test/archive body=provider-secret',
        createdAt: '2026-09-21T00:00:00.000Z',
      },
    ];

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Email delivery failed. Please retry.'),
    ).toBeTruthy();
    expect(screen.queryByText(/provider-secret/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry email' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeTruthy();
  });

  it('requires explicit confirmation before archiving the active Shared Space', () => {
    pageState.spacesQuery.data = [
      {
        id: '99',
        kind: 'shared',
        status: 'active',
        accessLevel: 'write',
      },
    ];

    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'End sharing' }));
    expect(
      screen.getByText(/Both members will lose editing access/u),
    ).toBeTruthy();
    expect(screen.getByText(/cannot be reopened/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    expect(pageState.leaveMutation.mutate).toHaveBeenCalledWith(
      '99',
      expect.any(Object),
    );
  });
});

function basicMutation() {
  return {
    error: null,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  };
}
