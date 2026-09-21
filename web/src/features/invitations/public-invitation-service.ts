import { readApiConfig } from '@/shared/api';

import type { PublicInvitation } from './invitations-service';

function publicInvitationUrl(baseUrl: string, token: string, action?: 'decline') {
  const path = `/api/v1/invitations/${encodeURIComponent(token)}${action ? `/${action}` : ''}`;
  return new URL(path, `${baseUrl.replace(/\/$/u, '')}/`).toString();
}

async function publicInvitationRequest<T>(
  token: string,
  action: 'preview' | 'decline',
  signal?: AbortSignal,
): Promise<T | undefined> {
  const { baseUrl } = readApiConfig();
  const response = await fetch(
    publicInvitationUrl(baseUrl, token, action === 'decline' ? 'decline' : undefined),
    {
      method: action === 'decline' ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        ...(action === 'decline' ? { 'Content-Type': 'application/json' } : {}),
      },
      signal,
      ...(action === 'decline' ? { body: JSON.stringify({ confirm: true }) } : {}),
    },
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error?: { message?: unknown } }).error?.message ?? 'The invitation is unavailable.')
        : 'The invitation is unavailable.';
    throw new Error(message);
  }
  return body as T | undefined;
}

async function getPublicInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<PublicInvitation> {
  const response = await publicInvitationRequest<unknown>(
    token,
    'preview',
    signal,
  );
  if (!isPublicInvitation(response)) {
    throw new Error('The invitation response was invalid.');
  }
  return response;
}

async function declinePublicInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  await publicInvitationRequest(token, 'decline', signal);
}

function isPublicInvitation(value: unknown): value is PublicInvitation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'senderName' in value &&
    typeof value.senderName === 'string' &&
    'recipientEmail' in value &&
    typeof value.recipientEmail === 'string' &&
    'status' in value &&
    value.status === 'pending' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'string' &&
    'canDecline' in value &&
    typeof value.canDecline === 'boolean'
  );
}

export { declinePublicInvitation, getPublicInvitation, isPublicInvitation };
