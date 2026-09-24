import type { InvitationStatus } from '../../database/entities/invitation.entity';

export const INVITATION_STORE = Symbol('INVITATION_STORE');

export type { InvitationStatus };

export interface InvitationRecord {
  id: string;
  senderUserId: string;
  acceptedSpaceId: string | null;
  codeHash: string;
  codeCiphertext: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvitationClaimRecord {
  id: string;
  invitationId: string;
  userId: string;
  senderUserId: string;
  senderName: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface NewInvitation {
  senderUserId: string;
  codeHash: string;
  codeCiphertext: string;
  expiresAt: Date;
}

export interface NewInvitationClaim {
  invitationId: string;
  userId: string;
  now: Date;
}

export interface InvitationStore {
  findPendingBySender(senderUserId: string): Promise<InvitationRecord | null>;
  findByCodeHash(codeHash: string): Promise<InvitationRecord | null>;
  findClaimsForUser(userId: string): Promise<InvitationClaimRecord[]>;
  create(input: NewInvitation): Promise<InvitationRecord>;
  rotatePending(
    senderUserId: string,
    replacement: NewInvitation,
    now: Date,
  ): Promise<InvitationRecord | null>;
  revokePending(senderUserId: string, now: Date): Promise<boolean>;
  createClaim(input: NewInvitationClaim): Promise<InvitationClaimRecord | null>;
  deleteClaimForUser(userId: string, claimId: string): Promise<boolean>;
  expirePending(before: Date): Promise<void>;
}
