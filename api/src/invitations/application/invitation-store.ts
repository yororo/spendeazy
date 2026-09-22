import type {
  InvitationDeliveryStatus,
  InvitationStatus,
} from '../../database/entities/invitation.entity';

export const INVITATION_STORE = Symbol('INVITATION_STORE');

export interface InvitationRecord {
  id: string;
  senderUserId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  acceptedSpaceId: string | null;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  lastSentAt: Date | null;
  deliveryStatus: InvitationDeliveryStatus;
  deliveryError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewInvitation {
  senderUserId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  tokenHash: string;
  expiresAt: Date;
  lastSentAt: Date | null;
  deliveryStatus?: InvitationDeliveryStatus;
  deliveryError?: string | null;
}

export interface UpdateInvitation {
  recipientUserId?: string | null;
  acceptedSpaceId?: string | null;
  tokenHash?: string;
  status?: InvitationStatus;
  expiresAt?: Date;
  lastSentAt?: Date | null;
  deliveryStatus?: InvitationDeliveryStatus;
  deliveryError?: string | null;
}

export interface DeliveryReservation {
  id: string;
}

export interface DeliveryReservationRequest {
  senderUserId: string;
  invitationId: string;
  now: Date;
  cooldownMs: number;
  dailyLimit: number;
  since: Date;
}

export interface InvitationStore {
  findPendingBySender(senderUserId: string): Promise<InvitationRecord | null>;
  findLatestBySender(senderUserId: string): Promise<InvitationRecord | null>;
  findBySender(
    senderUserId: string,
    invitationId: string,
  ): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  create(input: NewInvitation): Promise<InvitationRecord>;
  update(
    invitationId: string,
    input: UpdateInvitation,
  ): Promise<InvitationRecord | null>;
  associateRecipientEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<void>;
  listIncomingForEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<InvitationRecord[]>;
  expirePending(before: Date): Promise<void>;
  reserveDeliveryAttempt(
    input: DeliveryReservationRequest,
  ): Promise<DeliveryReservation>;
  completeDeliveryAttempt(
    attemptId: string,
    succeeded: boolean,
    error: string | null,
  ): Promise<void>;
}
