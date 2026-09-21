// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InvitationLandingPage } from './invitation-landing-page';

const token = 'a'.repeat(43);
const preview = {
  id: '42',
  senderName: 'Sender',
  recipientEmail: 'person@example.com',
  status: 'pending',
  expiresAt: '2026-09-28T00:00:00.000Z',
  canDecline: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('InvitationLandingPage', () => {
  it('shows limited context without an acceptance action and confirms decline', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'POST'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(preview), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderInvitationPage();

    expect(await screen.findByText('Sender')).toBeTruthy();
    expect(screen.getByText(/limited page only lets you review or decline/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Decline invitation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));

    expect(await screen.findByRole('status').then((element) => element.textContent)).toMatch(
      /invitation was declined/u,
    );
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'GET',
      'POST',
    ]);
  });
});

function renderInvitationPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<InvitationLandingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
