import { ApplicationError } from '../../errors/application-error';

export const INVITATION_ALREADY_PENDING_CODE = 'INVITATION_ALREADY_PENDING';
export const INVITATION_INELIGIBLE_CODE = 'INVITATION_INELIGIBLE';

export class InvitationAlreadyPendingError extends ApplicationError {
  constructor() {
    super(
      INVITATION_ALREADY_PENDING_CODE,
      'You already have a pending Invite Code',
    );
  }
}

export class InvitationIneligibleError extends ApplicationError {
  constructor() {
    super(
      INVITATION_INELIGIBLE_CODE,
      'You cannot create an Invite Code while you belong to an active Shared Space',
    );
  }
}
