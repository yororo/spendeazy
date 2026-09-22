import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { In, QueryFailedError, type EntityManager } from 'typeorm';

import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { InvitationDeliveryAttemptEntity } from '../../database/entities/invitation-delivery-attempt.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  InvitationAlreadyPendingError,
  InvitationCanceledError,
  InvitationDailyLimitReachedError,
  InvitationDeclinedError,
  InvitationNotFoundError,
  InvitationRateLimitedError,
} from '../application/invitation-errors';
import { assertInvitationSenderEligible } from '../application/invitation-eligibility';
import type {
  DeliveryReservation,
  DeliveryReservationRequest,
  InvitationRecord,
  InvitationStore,
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

  async listIncomingForEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<InvitationRecord[]> {
    const query = this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder('invitation')
      .where('invitation.status = :status', { status: 'pending' });

    if (recipientEmails.length === 0) {
      query.andWhere('invitation.recipient_user_id = :recipientUserId', {
        recipientUserId,
      });
    } else {
      query.andWhere(
        '(invitation.recipient_user_id = :recipientUserId OR (invitation.recipient_user_id IS NULL AND invitation.recipient_email IN (:...recipientEmails)))',
        { recipientUserId, recipientEmails },
      );
    }

    const entities = await query
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
    return this.entityManager.transaction(async (entityManager) => {
      const sender = await entityManager
        .getRepository(UserEntity)
        .createQueryBuilder('sender')
        .where('sender.id = :senderUserId', {
          senderUserId: input.senderUserId,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!sender) throw new InvitationNotFoundError();

      await assertSenderEligible(entityManager, input.senderUserId);

      const repository = entityManager.getRepository(InvitationEntity);
      const entity = repository.create({
        senderUserId: input.senderUserId,
        recipientEmail: input.recipientEmail,
        recipientUserId: input.recipientUserId,
        acceptedSpaceId: null,
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
    });
  }

  async update(
    invitationId: string,
    input: UpdateInvitation,
  ): Promise<InvitationRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(InvitationEntity);
      const entity = await repository
        .createQueryBuilder('invitation')
        .where('invitation.id = :invitationId', { invitationId })
        .setLock('pessimistic_write')
        .getOne();
      if (!entity) return null;

      const canReopenExpiredInvitation =
        input.status === 'pending' && entity.status === 'expired';
      if (
        input.status !== undefined &&
        entity.status !== 'pending' &&
        !canReopenExpiredInvitation
      ) {
        return toInvitationRecord(entity);
      }

      if (input.recipientUserId !== undefined) {
        entity.recipientUserId = input.recipientUserId;
      }
      if (input.acceptedSpaceId !== undefined) {
        entity.acceptedSpaceId = input.acceptedSpaceId;
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
    });
  }

  async associateRecipientEmails(
    recipientUserId: string,
    recipientEmails: readonly string[],
  ): Promise<void> {
    if (recipientEmails.length === 0) return;

    await this.entityManager
      .getRepository(InvitationEntity)
      .createQueryBuilder()
      .update(InvitationEntity)
      .set({ recipientUserId })
      .where('recipient_email IN (:...recipientEmails)', { recipientEmails })
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

  async reserveDeliveryAttempt({
    senderUserId,
    invitationId,
    now,
    cooldownMs,
    dailyLimit,
    since,
  }: DeliveryReservationRequest): Promise<DeliveryReservation> {
    return this.entityManager.transaction(async (entityManager) => {
      const sender = await entityManager
        .getRepository(UserEntity)
        .createQueryBuilder('sender')
        .where('sender.id = :senderUserId', { senderUserId })
        .setLock('pessimistic_write')
        .getOne();
      if (!sender) throw new InvitationNotFoundError();

      const invitation = await entityManager
        .getRepository(InvitationEntity)
        .createQueryBuilder('invitation')
        .where('invitation.id = :invitationId', { invitationId })
        .andWhere('invitation.sender_user_id = :senderUserId', {
          senderUserId,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!invitation) throw new InvitationNotFoundError();
      if (invitation.status === 'canceled') {
        throw new InvitationCanceledError();
      }
      if (invitation.status === 'declined') {
        throw new InvitationDeclinedError();
      }
      if (invitation.status === 'accepted') {
        throw new InvitationNotFoundError();
      }
      if (
        invitation.lastSentAt &&
        now.getTime() - invitation.lastSentAt.getTime() < cooldownMs
      ) {
        throw new InvitationRateLimitedError();
      }

      const attempts = await entityManager
        .getRepository(InvitationDeliveryAttemptEntity)
        .createQueryBuilder('attempt')
        .where('attempt.sender_user_id = :senderUserId', { senderUserId })
        .andWhere('attempt.attempted_at >= :since', { since })
        .getCount();
      if (attempts >= dailyLimit) {
        throw new InvitationDailyLimitReachedError();
      }

      invitation.lastSentAt = now;
      invitation.deliveryStatus = 'pending';
      invitation.deliveryError = null;
      await entityManager.getRepository(InvitationEntity).save(invitation);

      const attempt = await entityManager
        .getRepository(InvitationDeliveryAttemptEntity)
        .save(
          entityManager.getRepository(InvitationDeliveryAttemptEntity).create({
            invitationId,
            senderUserId,
            attemptedAt: now,
            succeeded: false,
            error: null,
          }),
        );
      return { id: attempt.id };
    });
  }

  async completeDeliveryAttempt(
    attemptId: string,
    succeeded: boolean,
    error: string | null,
  ): Promise<void> {
    const repository = this.entityManager.getRepository(
      InvitationDeliveryAttemptEntity,
    );
    const attempt = await repository.findOne({ where: { id: attemptId } });
    if (!attempt) throw new InvitationNotFoundError();
    attempt.succeeded = succeeded;
    attempt.error = error;
    await repository.save(attempt);
  }
}

function toInvitationRecord(entity: InvitationEntity): InvitationRecord {
  return {
    id: entity.id,
    senderUserId: entity.senderUserId,
    recipientEmail: entity.recipientEmail,
    recipientUserId: entity.recipientUserId,
    acceptedSpaceId: entity.acceptedSpaceId,
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
    (error.driverError as { code?: unknown; constraint?: unknown }).code ===
      POSTGRES_UNIQUE_VIOLATION &&
    (error.driverError as { constraint?: unknown }).constraint ===
      'ux_invitations_sender_pending'
  );
}

async function assertSenderEligible(
  entityManager: EntityManager,
  userId: string,
): Promise<void> {
  const memberships = await entityManager
    .getRepository(SpaceMembershipEntity)
    .findBy({ userId });
  if (memberships.length === 0) return;

  const spaces = await entityManager.getRepository(SpaceEntity).findBy({
    id: In([...new Set(memberships.map((membership) => membership.spaceId))]),
  });
  assertInvitationSenderEligible(spaces);
}
