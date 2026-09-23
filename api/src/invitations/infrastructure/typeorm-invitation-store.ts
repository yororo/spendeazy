import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager } from 'typeorm';

import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { InvitationAlreadyPendingError } from '../application/invitation-errors';
import type {
  InvitationRecord,
  InvitationStore,
  NewInvitation,
} from '../application/invitation-store';

@Injectable()
export class TypeOrmInvitationStore implements InvitationStore {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  async findPendingBySender(
    senderUserId: string,
  ): Promise<InvitationRecord | null> {
    const invitation = await this.entityManager
      .getRepository(InvitationEntity)
      .findOne({ where: { senderUserId, status: 'pending' } });

    return invitation ? toInvitationRecord(invitation) : null;
  }

  async create(input: NewInvitation): Promise<InvitationRecord> {
    const repository = this.entityManager.getRepository(InvitationEntity);
    try {
      const invitation = await repository.save(
        repository.create({
          ...input,
          status: 'pending',
        }),
      );
      return toInvitationRecord(invitation);
    } catch (error: unknown) {
      if (isPendingSenderConflict(error)) {
        throw new InvitationAlreadyPendingError();
      }
      throw error;
    }
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
}

function toInvitationRecord(entity: InvitationEntity): InvitationRecord {
  return {
    id: entity.id,
    senderUserId: entity.senderUserId,
    codeHash: entity.codeHash,
    codeCiphertext: entity.codeCiphertext,
    status: entity.status,
    expiresAt: entity.expiresAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function isPendingSenderConflict(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const driverError = error.driverError as {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    driverError.code === POSTGRES_UNIQUE_VIOLATION &&
    driverError.constraint === 'ux_invitations_sender_pending'
  );
}
