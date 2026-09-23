import type { InvitationStatus } from '../../database/entities/invitation.entity';

export const INVITATION_STORE = Symbol('INVITATION_STORE');

export type { InvitationStatus };

export interface InvitationRecord {
  id: string;
  senderUserId: string;
  codeHash: string;
  codeCiphertext: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewInvitation {
  senderUserId: string;
  codeHash: string;
  codeCiphertext: string;
  expiresAt: Date;
}

export interface InvitationStore {
  findPendingBySender(senderUserId: string): Promise<InvitationRecord | null>;
  create(input: NewInvitation): Promise<InvitationRecord>;
  expirePending(before: Date): Promise<void>;
}
