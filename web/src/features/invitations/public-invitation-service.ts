import { createPublicApiClient, readApiConfig } from '@/shared/api';

import type { PublicInvitation } from './invitations-service';

function publicInvitationPath(token: string, action?: 'decline'): string {
  return `/api/v1/invitations/${encodeURIComponent(token)}${action ? `/${action}` : ''}`;
}

async function getPublicInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<PublicInvitation> {
  const response = await createPublicApiClient(readApiConfig()).get<unknown>(
    publicInvitationPath(token),
    { signal },
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
  await createPublicApiClient(readApiConfig()).post(
    publicInvitationPath(token, 'decline'),
    { confirm: true },
    { signal, expectedStatuses: [204] },
  );
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
