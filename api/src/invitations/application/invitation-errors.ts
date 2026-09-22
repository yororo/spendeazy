import { ApplicationError } from '../../errors/application-error';

export const INVITATION_NOT_FOUND_CODE = 'INVITATION_NOT_FOUND';
export const INVITATION_ALREADY_PENDING_CODE = 'INVITATION_ALREADY_PENDING';
export const INVITATION_RATE_LIMITED_CODE = 'INVITATION_RATE_LIMITED';
export const INVITATION_DAILY_LIMIT_REACHED_CODE =
  'INVITATION_DAILY_LIMIT_REACHED';
export const INVITATION_SELF_CODE = 'INVITATION_SELF';
export const INVITATION_INELIGIBLE_CODE = 'INVITATION_INELIGIBLE';
export const INVITATION_EXPIRED_CODE = 'INVITATION_EXPIRED';
export const INVITATION_CANCELED_CODE = 'INVITATION_CANCELED';
export const INVITATION_DECLINED_CODE = 'INVITATION_DECLINED';

export class InvitationNotFoundError extends ApplicationError {
  constructor() {
    super(INVITATION_NOT_FOUND_CODE, 'Invitation was not found');
  }
}

export class InvitationAlreadyPendingError extends ApplicationError {
  constructor() {
    super(
      INVITATION_ALREADY_PENDING_CODE,
      'You already have a pending invitation',
    );
  }
}

export class InvitationRateLimitedError extends ApplicationError {
  constructor() {
    super(
      INVITATION_RATE_LIMITED_CODE,
      'Please wait before sending another invitation email',
    );
  }
}

export class InvitationDailyLimitReachedError extends ApplicationError {
  constructor() {
    super(
      INVITATION_DAILY_LIMIT_REACHED_CODE,
      'The daily invitation email limit has been reached',
    );
  }
}

export class InvitationSelfError extends ApplicationError {
  constructor() {
    super(INVITATION_SELF_CODE, 'You cannot invite yourself');
  }
}

export class InvitationIneligibleError extends ApplicationError {
  constructor(
    message = 'You cannot send invitations while you belong to an active Shared Space',
  ) {
    super(INVITATION_INELIGIBLE_CODE, message);
  }
}

export class InvitationExpiredError extends ApplicationError {
  constructor() {
    super(INVITATION_EXPIRED_CODE, 'This invitation has expired');
  }
}

export class InvitationCanceledError extends ApplicationError {
  constructor() {
    super(INVITATION_CANCELED_CODE, 'This invitation was canceled');
  }
}

export class InvitationDeclinedError extends ApplicationError {
  constructor() {
    super(INVITATION_DECLINED_CODE, 'This invitation was declined');
  }
}
