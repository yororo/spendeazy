import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { type EntityManager } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { SpaceNotificationEntity } from '../../database/entities/space-notification.entity';
import type {
  NewSpaceNotification,
  SpaceNotificationRecord,
  SpaceNotificationStore,
} from '../application/space-notification';
import type { SpaceArchiveMemberRecord } from '../application/space-lifecycle-store';

@Injectable()
export class TypeOrmSpaceNotificationStore implements SpaceNotificationStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async listForUser(userId: string): Promise<SpaceNotificationRecord[]> {
    const entities = await this.entityManager
      .getRepository(SpaceNotificationEntity)
      .find({
        where: { recipientUserId: userId },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    return entities.map(toRecord);
  }

  async findForUser(
    userId: string,
    notificationId: string,
  ): Promise<SpaceNotificationRecord | null> {
    const entity = await this.entityManager
      .getRepository(SpaceNotificationEntity)
      .findOne({ where: { id: notificationId, recipientUserId: userId } });
    return entity ? toRecord(entity) : null;
  }

  async findDeliveryContext(notificationId: string): Promise<{
    recipient: SpaceArchiveMemberRecord;
    actorName: string;
  } | null> {
    const notification = await this.entityManager
      .getRepository(SpaceNotificationEntity)
      .findOne({ where: { id: notificationId } });
    if (!notification) return null;

    const recipient = await this.entityManager
      .getRepository(UserEntity)
      .findOne({ where: { id: notification.recipientUserId } });
    if (!recipient) return null;

    let actorName = 'Deleted user';
    if (notification.actorUserId !== null) {
      const actor = await this.entityManager
        .getRepository(UserEntity)
        .findOne({ where: { id: notification.actorUserId } });
      actorName = actor?.name ?? 'Deleted user';
    }

    return {
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
      },
      actorName,
    };
  }

  async create(input: NewSpaceNotification): Promise<SpaceNotificationRecord> {
    const repository = this.entityManager.getRepository(
      SpaceNotificationEntity,
    );
    const existing = await repository.findOne({
      where: {
        recipientUserId: input.recipientUserId,
        spaceId: input.spaceId,
        type: input.type,
      },
    });
    if (existing) return toRecord(existing);

    const entity = repository.create({
      ...input,
      readAt: null,
      emailDeliveryStatus: 'pending',
      emailDeliveryError: null,
    });
    return toRecord(await repository.save(entity));
  }

  async updateDelivery(
    notificationId: string,
    status: SpaceNotificationRecord['emailDeliveryStatus'],
    error: string | null,
  ): Promise<SpaceNotificationRecord | null> {
    const repository = this.entityManager.getRepository(
      SpaceNotificationEntity,
    );
    const entity = await repository.findOne({ where: { id: notificationId } });
    if (!entity) return null;
    entity.emailDeliveryStatus = status;
    entity.emailDeliveryError = error;
    return toRecord(await repository.save(entity));
  }

  async markRead(
    userId: string,
    notificationId: string,
    readAt: Date,
  ): Promise<SpaceNotificationRecord | null> {
    const repository = this.entityManager.getRepository(
      SpaceNotificationEntity,
    );
    const entity = await repository.findOne({
      where: { id: notificationId, recipientUserId: userId },
    });
    if (!entity) return null;
    entity.readAt = readAt;
    return toRecord(await repository.save(entity));
  }
}

function toRecord(entity: SpaceNotificationEntity): SpaceNotificationRecord {
  return {
    id: entity.id,
    recipientUserId: entity.recipientUserId,
    spaceId: entity.spaceId,
    actorUserId: entity.actorUserId,
    type: entity.type,
    title: entity.title,
    message: entity.message,
    readAt: entity.readAt,
    emailDeliveryStatus: entity.emailDeliveryStatus,
    emailDeliveryError: entity.emailDeliveryError,
    createdAt: entity.createdAt,
  };
}
