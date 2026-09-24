import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager } from 'typeorm';

import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { InvitationClaimEntity } from '../../database/entities/invitation-claim.entity';
import { InvitationEntity } from '../../database/entities/invitation.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  InvitationAlreadyPendingError,
  InvitationCodeUnavailableError,
} from '../application/invitation-errors';
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
    const rows = await claimQuery(this.entityManager)
      .where('claim.user_id = :userId', { userId })
      .andWhere('invitation.status = :status', { status: 'pending' })
      .orderBy('claim.created_at', 'DESC')
      .addOrderBy('claim.id', 'DESC')
      .getRawMany<RawInvitationClaim>();

    return rows.map(toInvitationClaimRecord);
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

  async rotatePending(
    senderUserId: string,
    replacement: NewInvitation,
    now: Date,
  ): Promise<InvitationRecord | null> {
    return this.entityManager.transaction((entityManager) =>
      rotatePendingInTransaction(entityManager, senderUserId, replacement, now),
    );
  }

  async revokePending(senderUserId: string, now: Date): Promise<boolean> {
    return this.entityManager.transaction((entityManager) =>
      revokePendingInTransaction(entityManager, senderUserId, now),
    );
  }

  async createClaim(input: NewInvitationClaim): Promise<InvitationClaimRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      const invitation = await lockInvitation(
        entityManager,
        input.invitationId,
      );
      if (!invitation || invitation.senderUserId === input.userId) {
        throw new InvitationCodeUnavailableError();
      }
      if (
        invitation.status !== 'pending' ||
        invitation.expiresAt.getTime() <= input.now.getTime()
      ) {
        if (
          invitation.status === 'pending' &&
          invitation.expiresAt.getTime() <= input.now.getTime()
        ) {
          await expireInvitation(entityManager, invitation);
        }
        throw new InvitationCodeUnavailableError();
      }

      await entityManager
        .getRepository(InvitationClaimEntity)
        .createQueryBuilder()
        .insert()
        .into(InvitationClaimEntity)
        .values({
          invitationId: input.invitationId,
          userId: input.userId,
        })
        .orIgnore()
        .execute();

      const row = await claimQuery(entityManager)
        .where('claim.invitation_id = :invitationId', {
          invitationId: input.invitationId,
        })
        .andWhere('claim.user_id = :userId', { userId: input.userId })
        .getRawOne<RawInvitationClaim>();
      if (!row) {
        throw new Error('Invitation claim was not persisted');
      }

      return toInvitationClaimRecord(row);
    });
  }

  async deleteClaimForUser(userId: string, claimId: string): Promise<boolean> {
    const result = await this.entityManager
      .getRepository(InvitationClaimEntity)
      .delete({ id: claimId, userId });

    return result.affected === 1;
  }

  async expirePending(before: Date): Promise<void> {
    await this.entityManager.transaction((entityManager) =>
      expirePendingInTransaction(entityManager, before),
    );
  }
}

async function rotatePendingInTransaction(
  entityManager: EntityManager,
  senderUserId: string,
  replacement: NewInvitation,
  now: Date,
): Promise<InvitationRecord | null> {
  const current = await lockPendingInvitation(entityManager, senderUserId);
  if (!current) return null;
  if (current.expiresAt.getTime() <= now.getTime()) {
    await expireInvitation(entityManager, current);
    return null;
  }

  current.status = 'revoked';
  await entityManager.getRepository(InvitationEntity).save(current);
  await deleteClaimsForInvitation(entityManager, current.id);

  const repository = entityManager.getRepository(InvitationEntity);
  const created = await repository.save(
    repository.create({
      ...replacement,
      acceptedSpaceId: null,
      status: 'pending',
    }),
  );
  return toInvitationRecord(created);
}

async function revokePendingInTransaction(
  entityManager: EntityManager,
  senderUserId: string,
  now: Date,
): Promise<boolean> {
  const invitation = await lockPendingInvitation(entityManager, senderUserId);
  if (!invitation) return false;
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    await expireInvitation(entityManager, invitation);
    return false;
  }

  invitation.status = 'revoked';
  await entityManager.getRepository(InvitationEntity).save(invitation);
  await deleteClaimsForInvitation(entityManager, invitation.id);
  return true;
}

async function expirePendingInTransaction(
  entityManager: EntityManager,
  before: Date,
): Promise<void> {
  const result = await entityManager
    .getRepository(InvitationEntity)
    .createQueryBuilder()
    .update(InvitationEntity)
    .set({ status: 'expired' })
    .where('status = :status', { status: 'pending' })
    .andWhere('expires_at <= :before', { before })
    .returning(['id'])
    .execute();

  const invitationIds = (result.raw as readonly unknown[]).flatMap(
    (row): string[] => {
      if (typeof row !== 'object' || row === null) return [];
      const id = (row as { id?: unknown }).id;
      return typeof id === 'string' || typeof id === 'number'
        ? [String(id)]
        : [];
    },
  );
  if (invitationIds.length > 0) {
    await entityManager
      .getRepository(InvitationClaimEntity)
      .createQueryBuilder()
      .delete()
      .from(InvitationClaimEntity)
      .where('invitation_id IN (:...invitationIds)', { invitationIds })
      .execute();
  }
}

async function lockPendingInvitation(
  entityManager: EntityManager,
  senderUserId: string,
): Promise<InvitationEntity | null> {
  return entityManager
    .getRepository(InvitationEntity)
    .createQueryBuilder('invitation')
    .where('invitation.sender_user_id = :senderUserId', { senderUserId })
    .andWhere('invitation.status = :status', { status: 'pending' })
    .orderBy('invitation.id', 'ASC')
    .setLock('pessimistic_write')
    .getOne();
}

async function lockInvitation(
  entityManager: EntityManager,
  invitationId: string,
): Promise<InvitationEntity | null> {
  return entityManager
    .getRepository(InvitationEntity)
    .createQueryBuilder('invitation')
    .where('invitation.id = :invitationId', { invitationId })
    .setLock('pessimistic_write')
    .getOne();
}

async function expireInvitation(
  entityManager: EntityManager,
  invitation: InvitationEntity,
): Promise<void> {
  invitation.status = 'expired';
  await entityManager.getRepository(InvitationEntity).save(invitation);
  await deleteClaimsForInvitation(entityManager, invitation.id);
}

async function deleteClaimsForInvitation(
  entityManager: EntityManager,
  invitationId: string,
): Promise<void> {
  await entityManager
    .getRepository(InvitationClaimEntity)
    .delete({ invitationId });
}

function claimQuery(entityManager: EntityManager) {
  return entityManager
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

function toInvitationRecord(entity: InvitationEntity): InvitationRecord {
  return {
    id: entity.id,
    senderUserId: entity.senderUserId,
    acceptedSpaceId: entity.acceptedSpaceId,
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
