import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

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

/**
 * The default adapter is deliberately safe for local development: when no
 * delivery URL is configured it accepts the message at the boundary. A real
 * HTTP provider can be enabled with INVITATION_DELIVERY_URL and the optional
 * INVITATION_DELIVERY_API_KEY without putting credentials in source control.
 */
@Injectable()
export class HttpInvitationDelivery implements InvitationDelivery {
  constructor(
    @Inject('INVITATION_DELIVERY_CONFIG')
    private readonly config: {
      readonly url?: string;
      readonly apiKey?: string;
    },
  ) {}

  async send(input: InvitationEmail): Promise<void> {
    if (!this.config.url) return;

    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    if (this.config.apiKey) {
      headers.set('Authorization', `Bearer ${this.config.apiKey}`);
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: input.recipientEmail,
        subject: `${input.senderName} invited you to share finances on Spendeazy`,
        text: `${input.senderName} invited you to a Shared Space. Open this link to review the invitation: ${input.invitationUrl}`,
        invitationUrl: input.invitationUrl,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Invitation delivery provider returned ${response.status}`,
      );
    }
  }
}
