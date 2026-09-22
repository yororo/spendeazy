export const SPACE_NOTIFICATION_DELIVERY = Symbol(
  'SPACE_NOTIFICATION_DELIVERY',
);

export interface SharedSpaceArchivedEmail {
  notificationId: string;
  recipientEmail: string;
  recipientName: string;
  actorName: string;
  spaceId: string;
  message: string;
}

export interface SpaceNotificationDelivery {
  send(input: SharedSpaceArchivedEmail): Promise<void>;
}
