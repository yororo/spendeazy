import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { type EntityManager } from 'typeorm';
import { SpaceNotificationEntity } from '../../database/entities/space-notification.entity';
import type {
  NewSpaceNotification,
  SpaceNotificationRecord,
  SpaceNotificationStore,
} from '../application/space-notification';

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
    });
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
    createdAt: entity.createdAt,
  };
}
