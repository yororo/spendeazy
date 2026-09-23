export const INVITATION_CLOCK = Symbol('INVITATION_CLOCK');

export interface InvitationClock {
  now(): Date;
}

export class SystemInvitationClock implements InvitationClock {
  now(): Date {
    return new Date();
  }
}
