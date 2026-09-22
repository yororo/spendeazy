// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharingPage } from './sharing-page';
import type { Invitation } from './invitations-service';
import type { SpaceNotification } from './space-notification';

const pageState = vi.hoisted(() => ({
  invitationsQuery: {
    data: {
      outgoing: null as Invitation | null,
      incoming: [
        {
          id: '42',
          recipientEmail: 'person@example.com',
          status: 'pending' as const,
          expiresAt: '2026-09-28T00:00:00.000Z',
          lastSentAt: null,
          deliveryStatus: 'sent' as const,
          deliveryError: null,
          createdAt: '2026-09-21T00:00:00.000Z',
          updatedAt: '2026-09-21T00:00:00.000Z',
          senderName: 'Sender',
        },
      ],
    },
    error: new Error('Invitations unavailable'),
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  },
  acceptMutation: {
    error: null,
    isPending: false,
    variables: undefined as string | undefined,
    mutate: vi.fn(),
  },
  invitationContextQuery: {
    data: null as null | {
      id: string;
      senderName: string;
      recipientEmail: string;
      status: 'pending' | 'accepted' | 'canceled' | 'declined' | 'expired';
      expiresAt: string;
      canDecline: boolean;
    },
    error: null as Error | null,
    isError: false,
    isPending: false,
  },
  notificationsQuery: {
    data: [] as SpaceNotification[],
    error: null as Error | null,
    isError: false,
    isPending: false,
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

const openUserProfile = vi.hoisted(() => vi.fn());

vi.mock('@/shared/session', () => ({
  useAppSession: () => ({ openUserProfile }),
}));

vi.mock('@/shared/api', () => ({
  normalizeEmailDeliveryFailure: (error: string | null) =>
    error === null ? null : 'Email delivery failed. Please retry.',
  useAccessibleSpacesQuery: () => pageState.spacesQuery,
  useLeaveSharedSpaceMutation: () => pageState.leaveMutation,
}));

vi.mock('./space-notification-queries', () => ({
  useMarkSpaceNotificationReadMutation: () => basicMutation(),
  useRetrySpaceNotificationMutation: () => basicMutation(),
  useSpaceNotificationsQuery: () => pageState.notificationsQuery,
}));

vi.mock('./invitation-queries', () => ({
  useAcceptInvitationMutation: () => pageState.acceptMutation,
  useCancelInvitationMutation: () => basicMutation(),
  useCreateInvitationMutation: () => ({
    ...basicMutation(),
    isError: false,
  }),
  useDeclineInvitationMutation: () => basicMutation(),
  useInvitationsQuery: () => pageState.invitationsQuery,
  useResendInvitationMutation: () => basicMutation(),
  useRetryInvitationMutation: () => basicMutation(),
}));

vi.mock('./public-invitation-queries', () => ({
  usePublicInvitationQuery: () => pageState.invitationContextQuery,
}));

afterEach(() => {
  cleanup();
  pageState.acceptMutation.mutate.mockClear();
  pageState.invitationsQuery.data.outgoing = null;
  pageState.invitationContextQuery.data = null;
  pageState.invitationContextQuery.error = null;
  pageState.invitationContextQuery.isError = false;
  pageState.invitationContextQuery.isPending = false;
  pageState.notificationsQuery.data = [];
  pageState.notificationsQuery.error = null;
  pageState.notificationsQuery.isError = false;
  pageState.notificationsQuery.isPending = false;
  pageState.leaveMutation.error = null;
  pageState.leaveMutation.isPending = false;
  pageState.leaveMutation.mutate.mockClear();
  pageState.leaveMutation.reset.mockClear();
  openUserProfile.mockClear();
});

describe('SharingPage', () => {
  it('shows safe retry guidance for failed invitation and archive email delivery', () => {
    pageState.invitationsQuery.data.outgoing = {
      id: '44',
      recipientEmail: 'recipient@example.com',
      status: 'pending',
      expiresAt: '2026-09-28T00:00:00.000Z',
      lastSentAt: '2026-09-21T00:00:00.000Z',
      deliveryStatus: 'failed',
      deliveryError:
        'provider response https://mailer.example.test/send body=provider-secret',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
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
      screen.getAllByText('Email delivery failed. Please retry.'),
    ).toHaveLength(2);
    expect(screen.queryByText(/provider-secret/u)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry delivery' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry email' })).toBeTruthy();
  });

  it('explains and submits acceptance for an incoming invitation', () => {
    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/creates a separate Shared Space with Sender/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/no Transactions, Budgets, or learned Category Rules/u),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Accept invitation' }),
    );

    expect(pageState.acceptMutation.mutate).toHaveBeenCalledWith('42');
  });

  it('guides a signed-in recipient to verify the invited address before acceptance', () => {
    pageState.invitationsQuery.data = { outgoing: null, incoming: [] };
    pageState.invitationContextQuery.data = {
      id: '43',
      senderName: 'Sender',
      recipientEmail: 'invited@example.com',
      status: 'pending',
      expiresAt: '2026-09-28T00:00:00.000Z',
      canDecline: true,
    };

    render(
      <MemoryRouter initialEntries={['/sharing?invitationToken=invite-token']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/invited@example\.com/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/Add and verify that address in your Clerk profile/u),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Manage verified email addresses' }),
    );
    expect(openUserProfile).toHaveBeenCalledTimes(1);
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
    expect(
      screen.getByText(/cannot be reopened/u),
    ).toBeTruthy();

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
