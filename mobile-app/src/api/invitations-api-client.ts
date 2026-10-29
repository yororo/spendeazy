import { parseAccessibleSpace, type AccessibleSpace } from '../application/spaces/active-space.ts';
import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { decodeApiResponse } from './request-failure.ts';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type OutgoingInvitation = {
  id: string;
  code: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type IncomingInvitation = {
  id: string;
  senderName: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
};

export type InvitationInbox = {
  outgoing: OutgoingInvitation | null;
  incoming: IncomingInvitation[];
};

export function createInvitationsApiClient(options: AuthorizedRequestOptions) {
  return {
    async list(): Promise<InvitationInbox> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/invitations');
      return decodeApiResponse(() => readInbox(payload));
    },
    async create(): Promise<OutgoingInvitation> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/invitations', { method: 'POST', body: {} });
      return decodeApiResponse(() => readOutgoing(payload));
    },
    async rotate(): Promise<OutgoingInvitation> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/invitations/rotate', { method: 'POST', body: {} });
      return decodeApiResponse(() => readOutgoing(payload));
    },
    async revoke(): Promise<void> {
      await authorizedRequest<void>(options, '/api/v1/users/me/invitations', { method: 'DELETE' });
    },
    async claim(code: string): Promise<IncomingInvitation> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/invitations/claims', {
        method: 'POST', body: { code },
      });
      return decodeApiResponse(() => readIncoming(payload));
    },
    async decline(claimId: string): Promise<void> {
      await authorizedRequest<void>(options, `/api/v1/users/me/invitations/claims/${encodeURIComponent(claimId)}`, { method: 'DELETE' });
    },
    async accept(claimId: string): Promise<AccessibleSpace> {
      const payload = await authorizedRequest<unknown>(options, `/api/v1/users/me/invitations/claims/${encodeURIComponent(claimId)}/accept`, { method: 'POST', body: {} });
      return decodeApiResponse(() => parseAccessibleSpace(payload));
    },
  };
}

function readInbox(value: unknown): InvitationInbox {
  if (!isRecord(value) || !Array.isArray(value.incoming)) throw new Error('Invalid invitation inbox');
  return {
    outgoing: value.outgoing === null ? null : readOutgoing(value.outgoing),
    incoming: value.incoming.map(readIncoming),
  };
}

function readOutgoing(value: unknown): OutgoingInvitation {
  if (!isRecord(value) || typeof value.code !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u.test(value.code)) {
    throw new Error('Invalid outgoing invitation');
  }
  return {
    id: readId(value.id),
    code: value.code,
    status: readStatus(value.status),
    expiresAt: readTimestamp(value.expiresAt),
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
  };
}

function readIncoming(value: unknown): IncomingInvitation {
  if (!isRecord(value) || typeof value.senderName !== 'string' || value.senderName.trim() === '') {
    throw new Error('Invalid incoming invitation');
  }
  return {
    id: readId(value.id),
    senderName: value.senderName,
    status: readStatus(value.status),
    expiresAt: readTimestamp(value.expiresAt),
    createdAt: readTimestamp(value.createdAt),
  };
}

function readStatus(value: unknown): InvitationStatus {
  if (value === 'pending' || value === 'accepted' || value === 'revoked' || value === 'expired') return value;
  throw new Error('Invalid invitation status');
}

function readId(value: unknown): string {
  if (typeof value === 'string' && /^[1-9]\d*$/u.test(value)) return value;
  throw new Error('Invalid invitation id');
}

function readTimestamp(value: unknown): string {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  throw new Error('Invalid invitation timestamp');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
