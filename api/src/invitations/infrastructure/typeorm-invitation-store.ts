import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager } from 'typeorm';

import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { InvitationClaimEntity } from '../../database/entities/invitation-claim.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { InvitationAlreadyPendingError } from '../application/invitation-errors';
import type {
  InvitationClaimRecord,
  InvitationRecord,
  InvitationStore,
  NewInvitation,
  NewInvitationClaim,
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

  async findByCodeHash(codeHash: string): Promise<InvitationRecord | null> {
    const invitation = await this.entityManager
      .getRepository(InvitationEntity)
      .findOne({ where: { codeHash } });

    return invitation ? toInvitationRecord(invitation) : null;
  }

  async findClaimsForUser(userId: string): Promise<InvitationClaimRecord[]> {
    const rows = await this.claimQuery()
      .where('claim.user_id = :userId', { userId })
      .orderBy('claim.created_at', 'DESC')
      .addOrderBy('claim.id', 'DESC')
      .getRawMany<RawInvitationClaim>();

    return rows.map(toInvitationClaimRecord);
  }

  async findClaimForInvitationAndUser(
    invitationId: string,
    userId: string,
  ): Promise<InvitationClaimRecord | null> {
    const row = await this.claimQuery()
      .where('claim.invitation_id = :invitationId', { invitationId })
      .andWhere('claim.user_id = :userId', { userId })
      .getRawOne<RawInvitationClaim>();

    return row ? toInvitationClaimRecord(row) : null;
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

  async createClaim(input: NewInvitationClaim): Promise<InvitationClaimRecord> {
    const repository = this.entityManager.getRepository(InvitationClaimEntity);
    try {
      await repository.save(repository.create(input));
    } catch (error: unknown) {
      if (!isInvitationClaimConflict(error)) {
        throw error;
      }
    }

    const claim = await this.findClaimForInvitationAndUser(
      input.invitationId,
      input.userId,
    );
    if (!claim) {
      throw new Error('Invitation claim was not persisted');
    }

    return claim;
  }

  async deleteClaimForUser(userId: string, claimId: string): Promise<boolean> {
    const result = await this.entityManager
      .getRepository(InvitationClaimEntity)
      .delete({ id: claimId, userId });

    return result.affected === 1;
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

  private claimQuery() {
    return this.entityManager
      .getRepository(InvitationClaimEntity)
      .createQueryBuilder('claim')
      .innerJoin(
        InvitationEntity,
        'invitation',
        'invitation.id = claim.invitation_id',
      )
      .innerJoin(UserEntity, 'sender', 'sender.id = invitation.sender_user_id')
      .select([
        'claim.id AS claim_id',
        'claim.invitation_id AS invitation_id',
        'claim.user_id AS user_id',
        'invitation.sender_user_id AS sender_user_id',
        'sender.name AS sender_name',
        'invitation.status AS invitation_status',
        'invitation.expires_at AS expires_at',
        'claim.created_at AS claim_created_at',
      ]);
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

interface RawInvitationClaim {
  claim_id: string;
  invitation_id: string;
  user_id: string;
  sender_user_id: string;
  sender_name: string;
  invitation_status: InvitationRecord['status'];
  expires_at: Date;
  claim_created_at: Date;
}

function toInvitationClaimRecord(
  row: RawInvitationClaim,
): InvitationClaimRecord {
  return {
    id: row.claim_id,
    invitationId: row.invitation_id,
    userId: row.user_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    status: row.invitation_status,
    expiresAt: row.expires_at,
    createdAt: row.claim_created_at,
  };
}

function isInvitationClaimConflict(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const driverError = error.driverError as {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    driverError.code === POSTGRES_UNIQUE_VIOLATION &&
    driverError.constraint === 'ux_invitation_claims_invitation_user'
  );
}
