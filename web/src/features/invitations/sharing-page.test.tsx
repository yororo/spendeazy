// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SharingPage } from './sharing-page';
import type { SpaceNotification } from './space-notification';

const pageState = vi.hoisted(() => ({
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

afterEach(() => {
  cleanup();
  pageState.notificationsQuery.data = [];
  pageState.notificationsQuery.error = null;
  pageState.notificationsQuery.isError = false;
  pageState.notificationsQuery.isPending = false;
  pageState.spacesQuery.data = [];
  pageState.leaveMutation.error = null;
  pageState.leaveMutation.isPending = false;
  pageState.leaveMutation.mutate.mockClear();
  pageState.leaveMutation.reset.mockClear();
});

describe('SharingPage', () => {
  it('explains that new Shared Space creation is temporarily unavailable', () => {
    render(
      <MemoryRouter initialEntries={['/sharing']}>
        <SharingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Shared Space creation is temporarily unavailable',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Invite Codes are being built/u)).toBeTruthy();
    expect(screen.queryByLabelText('Recipient email')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Send invitation' }),
    ).toBeNull();
    expect(
      screen.queryByText(/resend|retry delivery|accept invitation/iu),
    ).toBeNull();
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
