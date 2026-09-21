import { describe, expect, it, vi } from 'vitest';

import {
  declinePublicInvitation,
  getPublicInvitation,
  isPublicInvitation,
} from './public-invitation-service';

const preview = {
  id: '42',
  senderName: 'Sender',
  recipientEmail: 'person@example.com',
  status: 'pending' as const,
  expiresAt: '2026-09-28T00:00:00.000Z',
  canDecline: true,
};

describe('public invitation service', () => {
  it('validates a public preview and propagates cancellation', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(preview), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(getPublicInvitation('token-value', signal)).resolves.toEqual(
      preview,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/invitations/token-value',
      expect.objectContaining({ method: 'GET', signal }),
    );

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(declinePublicInvitation('token-value', signal)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.test/api/v1/invitations/token-value/decline',
      expect.objectContaining({ method: 'POST', signal }),
    );
  });

  it('rejects malformed preview data', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    await expect(getPublicInvitation('token-value')).rejects.toThrow(
      'invalid',
    );
    expect(isPublicInvitation(preview)).toBe(true);
    expect(isPublicInvitation({ ...preview, status: 'declined' })).toBe(false);
  });
});
