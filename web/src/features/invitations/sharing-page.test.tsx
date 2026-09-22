// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharingPage } from './sharing-page';

const pageState = vi.hoisted(() => ({
  invitationsQuery: {
    data: {
      outgoing: null,
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

afterEach(() => {
  cleanup();
  pageState.acceptMutation.mutate.mockClear();
});

describe('SharingPage', () => {
  it('explains and submits acceptance for an incoming invitation', () => {
    render(<SharingPage />);

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
});

function basicMutation() {
  return {
    error: null,
    isPending: false,
    mutate: vi.fn(),
  };
}
