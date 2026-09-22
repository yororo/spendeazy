import { Inject, Injectable } from '@nestjs/common';
import type {
  SharedSpaceArchivedEmail,
  SpaceNotificationDelivery,
} from '../application/space-notification-delivery';

@Injectable()
export class HttpSpaceNotificationDelivery implements SpaceNotificationDelivery {
  constructor(
    @Inject('SPACE_NOTIFICATION_DELIVERY_CONFIG')
    private readonly config: {
      readonly url?: string;
      readonly apiKey?: string;
    },
  ) {}

  async send(input: SharedSpaceArchivedEmail): Promise<void> {
    if (!this.config.url) {
      throw new Error('Space notification delivery provider is not configured');
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
        subject: 'Your Spendeazy Shared Space is now archived',
        text: input.message,
        spaceId: input.spaceId,
        notificationId: input.notificationId,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Space notification delivery provider returned ${response.status}`,
      );
    }
  }
}
