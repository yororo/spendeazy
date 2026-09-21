import { Inject, Injectable } from '@nestjs/common';

import type {
  InvitationDelivery,
  InvitationEmail,
} from '../application/invitation-delivery';

/**
 * The adapter delegates delivery to a configured provider. A missing provider
 * is reported as a delivery failure so the invitation never claims that an
 * email was sent when no external boundary was crossed.
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
    if (!this.config.url) {
      throw new Error('Invitation delivery provider is not configured');
    }

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
