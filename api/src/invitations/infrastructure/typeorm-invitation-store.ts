import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager } from 'typeorm';

import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { InvitationDeliveryAttemptEntity } from '../../database/entities/invitation-delivery-attempt.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { InvitationAlreadyPendingError } from '../application/invitation-errors';
import type {
  InvitationRecord,
  InvitationStore,
  NewDeliveryAttempt,
  NewInvitation,
  UpdateInvitation,
} from '../application/invitation-store';

@Injectable()
export class TypeOrmInvitationStore implements InvitationStore {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  async findPendingBySender(
    senderUserId: string,
  ): Promise<InvitationRecord | null> {
    const entity = await this.entityManager
      .getRepository(InvitationEntity)
      .findOne({ where: { senderUserId, status: 'pending' } });
    return entity ? toInvitationRecord(entity) : null;
  }

  async findLatestBySender(
    senderUserId: string,
  ): Promise<InvitationRecord | null> {
    const entity = await this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder('invitation')
      .where('invitation.senderUserId = :senderUserId', { senderUserId })
      .orderBy('invitation.createdAt', 'DESC')
      .addOrderBy('invitation.id', 'DESC')
      .getOne();
    return entity ? toInvitationRecord(entity) : null;
  }

  async findBySender(
    senderUserId: string,
    invitationId: string,
  ): Promise<InvitationRecord | null> {
    const entity = await this.entityManager
      .getRepository(InvitationEntity)
      .findOne({ where: { id: invitationId, senderUserId } });
    return entity ? toInvitationRecord(entity) : null;
  }

  async listIncoming(
    recipientUserId: string,
    recipientEmail: string,
  ): Promise<InvitationRecord[]> {
    const entities = await this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder('invitation')
      .where('invitation.status = :status', { status: 'pending' })
      .andWhere(
        '(invitation.recipientUserId = :recipientUserId OR invitation.recipientEmail = :recipientEmail)',
        { recipientUserId, recipientEmail },
      )
      .orderBy('invitation.createdAt', 'DESC')
      .getMany();
    return entities.map(toInvitationRecord);
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const entity = await this.entityManager
      .getRepository(InvitationEntity)
      .findOne({ where: { tokenHash } });
    return entity ? toInvitationRecord(entity) : null;
  }

  async create(input: NewInvitation): Promise<InvitationRecord> {
    const repository = this.entityManager.getRepository(InvitationEntity);
    const entity = repository.create({
      senderUserId: input.senderUserId,
      recipientEmail: input.recipientEmail,
      recipientUserId: input.recipientUserId,
      tokenHash: input.tokenHash,
      status: 'pending',
      expiresAt: input.expiresAt,
      lastSentAt: input.lastSentAt,
      deliveryStatus: input.deliveryStatus ?? 'pending',
      deliveryError: input.deliveryError ?? null,
    });

    try {
      return toInvitationRecord(await repository.save(entity));
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new InvitationAlreadyPendingError();
      }
      throw error;
    }
  }

  async update(
    invitationId: string,
    input: UpdateInvitation,
  ): Promise<InvitationRecord | null> {
    const repository = this.entityManager.getRepository(InvitationEntity);
    const entity = await repository.findOne({ where: { id: invitationId } });
    if (!entity) return null;

    if (input.recipientUserId !== undefined) {
      entity.recipientUserId = input.recipientUserId;
    }
    if (input.tokenHash !== undefined) entity.tokenHash = input.tokenHash;
    if (input.status !== undefined) entity.status = input.status;
    if (input.expiresAt !== undefined) entity.expiresAt = input.expiresAt;
    if (input.lastSentAt !== undefined) entity.lastSentAt = input.lastSentAt;
    if (input.deliveryStatus !== undefined) {
      entity.deliveryStatus = input.deliveryStatus;
    }
    if (input.deliveryError !== undefined) {
      entity.deliveryError = input.deliveryError;
    }

    try {
      return toInvitationRecord(await repository.save(entity));
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new InvitationAlreadyPendingError();
      }
      throw error;
    }
  }

  async associateRecipientEmail(
    recipientUserId: string,
    recipientEmail: string,
  ): Promise<void> {
    await this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder()
      .update(InvitationEntity)
      .set({ recipientUserId })
      .where('recipient_email = :recipientEmail', { recipientEmail })
      .andWhere('status = :status', { status: 'pending' })
      .andWhere('recipient_user_id IS NULL')
      .execute();
  }

  async expirePending(before: Date): Promise<void> {
    await this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder()
      .update(InvitationEntity)
      .set({ status: 'expired' })
      .where('status = :status', { status: 'pending' })
      .andWhere('expires_at <= :before', { before })
      .execute();
  }

  async countDeliveryAttempts(
    senderUserId: string,
    since: Date,
  ): Promise<number> {
    return this.entityManager
      .getRepository(InvitationDeliveryAttemptEntity)
      .createQueryBuilder('attempt')
      .where('attempt.senderUserId = :senderUserId', { senderUserId })
      .andWhere('attempt.attemptedAt >= :since', { since })
      .getCount();
  }

  async recordDeliveryAttempt(input: NewDeliveryAttempt): Promise<void> {
    await this.entityManager
      .getRepository(InvitationDeliveryAttemptEntity)
      .save(
        this.entityManager
          .getRepository(InvitationDeliveryAttemptEntity)
          .create({
            invitationId: input.invitationId,
            senderUserId: input.senderUserId,
            attemptedAt: input.attemptedAt,
            succeeded: input.succeeded,
            error: input.error,
          }),
      );
  }
}

function toInvitationRecord(entity: InvitationEntity): InvitationRecord {
  return {
    id: entity.id,
    senderUserId: entity.senderUserId,
    recipientEmail: entity.recipientEmail,
    recipientUserId: entity.recipientUserId,
    tokenHash: entity.tokenHash,
    status: entity.status,
    expiresAt: entity.expiresAt,
    lastSentAt: entity.lastSentAt,
    deliveryStatus: entity.deliveryStatus,
    deliveryError: entity.deliveryError,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
