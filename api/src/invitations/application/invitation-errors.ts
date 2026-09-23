import { ApplicationError } from '../../errors/application-error';

export const INVITATION_ALREADY_PENDING_CODE = 'INVITATION_ALREADY_PENDING';
export const INVITATION_INELIGIBLE_CODE = 'INVITATION_INELIGIBLE';
export const INVITATION_CODE_UNAVAILABLE_CODE = 'INVITATION_CODE_UNAVAILABLE';
export const INVITATION_CODE_RATE_LIMITED_CODE = 'INVITATION_CODE_RATE_LIMITED';
export const INVITATION_CLAIM_NOT_FOUND_CODE = 'INVITATION_CLAIM_NOT_FOUND';

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

export class InvitationCodeUnavailableError extends ApplicationError {
  constructor() {
    super(
      INVITATION_CODE_UNAVAILABLE_CODE,
      'Invite Code is unavailable. Ask the sender for a current code.',
    );
  }
}

export class InvitationCodeRateLimitedError extends ApplicationError {
  constructor() {
    super(
      INVITATION_CODE_RATE_LIMITED_CODE,
      'Too many Invite Code attempts. Try again later.',
    );
  }
}

export class InvitationClaimNotFoundError extends ApplicationError {
  constructor() {
    super(
      INVITATION_CLAIM_NOT_FOUND_CODE,
      'The saved invitation is no longer available.',
    );
  }
}
