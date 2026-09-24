import {
  isAccessibleSpace,
  isRecord,
  isUtcDateTime,
  requireApiResponse,
  type AccessibleSpace,
  type ApiClient,
} from '@/shared/api';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface OutgoingInvitation {
  readonly id: string;
  readonly code: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IncomingInvitation {
  readonly id: string;
  readonly senderName: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface InvitationInbox {
  readonly outgoing: OutgoingInvitation | null;
  readonly incoming: readonly IncomingInvitation[];
}

type InvitationsApiClient = Pick<ApiClient, 'delete' | 'get' | 'post'>;

class InvitationsDataError extends Error {
  readonly kind = 'data' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvitationsDataError';
  }
}

function isInvitationStatus(value: unknown): value is InvitationStatus {
  return (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'revoked' ||
    value === 'expired'
  );
}

function isInvitationCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u.test(value)
  );
}

function isOutgoingInvitation(value: unknown): value is OutgoingInvitation {
  return (
    isRecord(value) &&
    /^[1-9]\d*$/u.test(String(value.id)) &&
    isInvitationCode(value.code) &&
    isInvitationStatus(value.status) &&
    isUtcDateTime(value.expiresAt) &&
    isUtcDateTime(value.createdAt) &&
    isUtcDateTime(value.updatedAt)
  );
}

function isIncomingInvitation(value: unknown): value is IncomingInvitation {
  return (
    isRecord(value) &&
    /^[1-9]\d*$/u.test(String(value.id)) &&
    typeof value.senderName === 'string' &&
    isInvitationStatus(value.status) &&
    isUtcDateTime(value.expiresAt) &&
    isUtcDateTime(value.createdAt)
  );
}

function invalidInvitationResponse(description: string): InvitationsDataError {
  return new InvitationsDataError(
    `The API returned an invalid ${description}.`,
  );
}

function requireOutgoingInvitation(
  value: unknown,
  description: string,
): OutgoingInvitation {
  if (!isOutgoingInvitation(value)) {
    throw invalidInvitationResponse(description);
  }

  return value;
}

function requireIncomingInvitation(value: unknown): IncomingInvitation {
  if (!isIncomingInvitation(value)) {
    throw invalidInvitationResponse('incoming invitation');
  }

  return value;
}

function requireInvitationInbox(value: unknown): InvitationInbox {
  if (
    !isRecord(value) ||
    (value.outgoing !== null && !isOutgoingInvitation(value.outgoing)) ||
    !Array.isArray(value.incoming) ||
    !value.incoming.every(isIncomingInvitation)
  ) {
    throw invalidInvitationResponse('invitation inbox');
  }

  return {
    outgoing:
      value.outgoing === null
        ? null
        : requireOutgoingInvitation(value.outgoing, 'outgoing invitation'),
    incoming: value.incoming,
  };
}

async function getInvitations(
  apiClient: Pick<InvitationsApiClient, 'get'>,
  signal?: AbortSignal,
): Promise<InvitationInbox> {
  const response = await apiClient.get<unknown>('/invitations', { signal });
  return requireInvitationInbox(
    requireApiResponse(response, 'invitation inbox', invalidInvitationResponse),
  );
}

async function createInvitation(
  apiClient: Pick<InvitationsApiClient, 'post'>,
): Promise<OutgoingInvitation> {
  const response = await apiClient.post<unknown>(
    '/invitations',
    {},
    { expectedStatuses: [201] },
  );
  return requireOutgoingInvitation(
    requireApiResponse(
      response,
      'created invitation',
      invalidInvitationResponse,
    ),
    'created invitation',
  );
}

async function claimInvitation(
  apiClient: Pick<InvitationsApiClient, 'post'>,
  code: string,
): Promise<IncomingInvitation> {
  const response = await apiClient.post<unknown>(
    '/invitations/claims',
    { code },
    { expectedStatuses: [201] },
  );
  return requireIncomingInvitation(
    requireApiResponse(
      response,
      'saved incoming invitation',
      invalidInvitationResponse,
    ),
  );
}

async function declineInvitation(
  apiClient: Pick<InvitationsApiClient, 'delete'>,
  claimId: string,
): Promise<void> {
  await apiClient.delete<unknown>(`/invitations/claims/${claimId}`, {
    expectedStatuses: [204],
  });
}

async function acceptInvitation(
  apiClient: Pick<InvitationsApiClient, 'post'>,
  claimId: string,
): Promise<AccessibleSpace> {
  const response = await apiClient.post<unknown>(
    `/invitations/claims/${encodeURIComponent(claimId)}/accept`,
    {},
    { expectedStatuses: [200] },
  );
  const value = requireApiResponse(
    response,
    'accepted Shared Space',
    invalidInvitationResponse,
  );
  if (!isAccessibleSpace(value)) {
    throw invalidInvitationResponse('accepted Shared Space');
  }

  return value;
}

export {
  acceptInvitation,
  claimInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  InvitationsDataError,
  isIncomingInvitation,
  isInvitationCode,
  isInvitationStatus,
  isOutgoingInvitation,
  requireIncomingInvitation,
  requireInvitationInbox,
  requireOutgoingInvitation,
};
export type { InvitationsApiClient };
