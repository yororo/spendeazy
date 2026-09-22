import {
  isRecord,
  isAccessibleSpace,
  isUtcDateTime,
  normalizeEmailDeliveryFailure,
  requireApiResponse,
  type ApiClient,
  type AccessibleSpace,
} from '@/shared/api';

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'canceled'
  | 'declined'
  | 'expired';
export type InvitationDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface Invitation {
  readonly id: string;
  readonly recipientEmail: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly lastSentAt: string | null;
  readonly deliveryStatus: InvitationDeliveryStatus;
  readonly deliveryError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly senderName?: string;
}

export interface InvitationInbox {
  readonly outgoing: Invitation | null;
  readonly incoming: readonly Invitation[];
}

export interface PublicInvitation {
  readonly id: string;
  readonly senderName: string;
  readonly recipientEmail: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly canDecline: boolean;
}

type InvitationsApiClient = Pick<ApiClient, 'get' | 'post' | 'delete'>;

class InvitationsDataError extends Error {
  readonly kind = 'data' as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'InvitationsDataError';
  }
}

const createInvitationsDataError = (message: string) =>
  new InvitationsDataError(message);

function isInvitation(value: unknown): value is Invitation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.recipientEmail === 'string' &&
    isInvitationStatus(value.status) &&
    isUtcDateTime(value.expiresAt) &&
    (value.lastSentAt === null || isUtcDateTime(value.lastSentAt)) &&
    isInvitationDeliveryStatus(value.deliveryStatus) &&
    (value.deliveryError === null || typeof value.deliveryError === 'string') &&
    isUtcDateTime(value.createdAt) &&
    isUtcDateTime(value.updatedAt) &&
    (value.senderName === undefined || typeof value.senderName === 'string')
  );
}

function requireInvitation(value: unknown, description: string): Invitation {
  if (!isInvitation(value)) {
    throw createInvitationsDataError(`The API returned an invalid ${description}.`);
  }
  return toSafeInvitation(value);
}

function requireInvitationInbox(value: unknown): InvitationInbox {
  if (
    !isRecord(value) ||
    (value.outgoing !== null && !isInvitation(value.outgoing)) ||
    !Array.isArray(value.incoming) ||
    !value.incoming.every(isInvitation)
  ) {
    throw createInvitationsDataError('The API returned an invalid invitation inbox.');
  }
  return {
    outgoing:
      value.outgoing === null
        ? null
        : toSafeInvitation(value.outgoing as Invitation),
    incoming: (value.incoming as Invitation[]).map(toSafeInvitation),
  };
}

function toSafeInvitation(invitation: Invitation): Invitation {
  const deliveryError = normalizeEmailDeliveryFailure(
    invitation.deliveryError,
  );
  if (deliveryError === invitation.deliveryError) return invitation;

  return {
    ...invitation,
    deliveryError,
  };
}

async function getInvitations(
  apiClient: InvitationsApiClient,
  signal?: AbortSignal,
): Promise<InvitationInbox> {
  const response = await apiClient.get<unknown>('/invitations', { signal });
  return requireInvitationInbox(
    requireApiResponse(response, 'invitation inbox', createInvitationsDataError),
  );
}

async function createInvitation(
  apiClient: InvitationsApiClient,
  email: string,
): Promise<Invitation> {
  const response = await apiClient.post<unknown>(
    '/invitations',
    { email: email.trim() },
    { expectedStatuses: [201] },
  );
  return requireInvitation(
    requireApiResponse(response, 'created invitation', createInvitationsDataError),
    'created invitation',
  );
}

async function cancelInvitation(
  apiClient: InvitationsApiClient,
  invitationId: string,
): Promise<void> {
  await apiClient.delete(`/invitations/${encodeURIComponent(invitationId)}`, {
    expectedStatuses: [204],
  });
}

async function resendInvitation(
  apiClient: InvitationsApiClient,
  invitationId: string,
): Promise<Invitation> {
  const response = await apiClient.post<unknown>(
    `/invitations/${encodeURIComponent(invitationId)}/resend`,
    {},
    { expectedStatuses: [200] },
  );
  return requireInvitation(
    requireApiResponse(response, 'resent invitation', createInvitationsDataError),
    'resent invitation',
  );
}

async function retryInvitation(
  apiClient: InvitationsApiClient,
  invitationId: string,
): Promise<Invitation> {
  const response = await apiClient.post<unknown>(
    `/invitations/${encodeURIComponent(invitationId)}/retry`,
    {},
    { expectedStatuses: [200] },
  );
  return requireInvitation(
    requireApiResponse(response, 'retried invitation', createInvitationsDataError),
    'retried invitation',
  );
}

async function declineInvitation(
  apiClient: InvitationsApiClient,
  invitationId: string,
): Promise<void> {
  await apiClient.post(
    `/invitations/${encodeURIComponent(invitationId)}/decline`,
    { confirm: true },
    { expectedStatuses: [204] },
  );
}

async function acceptInvitation(
  apiClient: InvitationsApiClient,
  invitationId: string,
): Promise<AccessibleSpace> {
  const response = await apiClient.post<unknown>(
    `/invitations/${encodeURIComponent(invitationId)}/accept`,
    {},
    { expectedStatuses: [200] },
  );
  const value = requireApiResponse(
    response,
    'accepted invitation',
    createInvitationsDataError,
  );
  if (!isAccessibleSpace(value)) {
    throw createInvitationsDataError(
      'The API returned an invalid accepted Shared Space.',
    );
  }
  return value;
}

export function isInvitationStatus(value: unknown): value is InvitationStatus {
  return (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'canceled' ||
    value === 'declined' ||
    value === 'expired'
  );
}

function isInvitationDeliveryStatus(
  value: unknown,
): value is InvitationDeliveryStatus {
  return value === 'pending' || value === 'sent' || value === 'failed';
}

export {
  acceptInvitation,
  InvitationsDataError,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  requireInvitation,
  requireInvitationInbox,
  resendInvitation,
  retryInvitation,
};
export type { InvitationsApiClient };
