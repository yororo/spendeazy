import type { AccessibleSpaceRecord } from '../../spaces/application/space-store';

export const INVITATION_ACCEPTANCE_STORE = Symbol(
  'INVITATION_ACCEPTANCE_STORE',
);

export interface AcceptInvitationInput {
  claimId: string;
  recipientUserId: string;
  now: Date;
}

export interface InvitationAcceptanceStore {
  accept(input: AcceptInvitationInput): Promise<AccessibleSpaceRecord>;
}
