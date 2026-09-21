import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_DELIVERY = Symbol('INVITATION_DELIVERY');
export const INVITATION_CLOCK = Symbol('INVITATION_CLOCK');

export interface InvitationClock {
  now(): Date;
}

export interface InvitationEmail {
  invitationId: string;
  recipientEmail: string;
  senderName: string;
  invitationUrl: string;
}

export interface InvitationDelivery {
  send(input: InvitationEmail): Promise<void>;
}

export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SystemInvitationClock implements InvitationClock {
  now(): Date {
    return new Date();
  }
}
