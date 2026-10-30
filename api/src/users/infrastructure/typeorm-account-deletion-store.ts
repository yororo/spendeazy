import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, QueryFailedError } from 'typeorm';
import { AccountDeletionOperationEntity } from '../../database/entities/account-deletion-operation.entity';
import type { AccountDeletionStore } from '../application/account-deletion-store';
import type {
  AccountDeletionOperationRecord,
  AccountDeletionFailureCode,
} from '../application/account-deletion-operation';
import { UserNotFoundError } from '../application/user-errors';
import type { IdentityExecutionMode } from '../application/active-identity-execution';

class RediscoverMemberships extends Error {}

const CLAIM_DURATION_MS = 120_000;
const INITIAL_RETRY_MS = 5000;
const MAX_RETRY_MS = 900_000;

export async function lockProviderIdentity(
  manager: EntityManager,
  clerkUserId: string,
) {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    clerkUserId,
  ]);
}

/** Discover peers before locking; retry the entire transaction if discovery changed. */
export async function lockIdentityParticipants(
  manager: EntityManager,
  userId: string,
  exclusive: boolean,
) {
  const discover = () =>
    manager.query<{ id: string }[]>(
      `
    SELECT $1::bigint::text AS id UNION
    SELECT peer.user_id::text FROM space_memberships own
      JOIN space_memberships peer ON peer.space_id = own.space_id WHERE own.user_id = $1
    UNION SELECT i.sender_user_id::text FROM invitation_claims c
      JOIN invitations i ON i.id = c.invitation_id WHERE c.user_id = $1
  `,
      [userId],
    );
  const initial = (await discover()).map((row) => row.id);
  await manager.query(
    `SELECT id FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR ${exclusive ? 'UPDATE' : 'SHARE'}`,
    [initial],
  );
  const current = await discover();
  if (current.some((row) => !initial.includes(row.id)))
    throw new RediscoverMemberships();
}

export async function withIdentityParticipants<T>(
  manager: EntityManager,
  userId: string,
  mode: IdentityExecutionMode,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  for (;;) {
    try {
      return await manager.transaction(
        mode === 'read' ? 'REPEATABLE READ' : 'READ COMMITTED',
        async (tx) => {
          await lockIdentityParticipants(tx, userId, mode === 'membership');
          return work(tx);
        },
      );
    } catch (error) {
      if (
        !(error instanceof RediscoverMemberships) &&
        !(
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === '40001'
        )
      )
        throw error;
    }
  }
}

@Injectable()
export class TypeOrmAccountDeletionStore implements AccountDeletionStore {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}
  find(clerkUserId: string) {
    return this.manager
      .getRepository(AccountDeletionOperationEntity)
      .findOneBy({ oldClerkUserId: clerkUserId });
  }

  async accept(
    clerkUserId: string,
    sessionId: string,
  ): Promise<AccountDeletionOperationRecord> {
    for (;;) {
      try {
        return await this.manager.transaction(async (tx) => {
          await lockProviderIdentity(tx, clerkUserId);
          const existing = await tx
            .getRepository(AccountDeletionOperationEntity)
            .findOneBy({ oldClerkUserId: clerkUserId });
          if (existing) return existing;
          const users = await tx.query<{ id: string }[]>(
            "SELECT id FROM users WHERE clerk_user_id = $1 AND deletion_status = 'active'",
            [clerkUserId],
          );
          const userId = users[0]?.id;
          if (!userId) throw new UserNotFoundError();
          await lockIdentityParticipants(tx, userId, true);
          const spaces = await tx.query<
            { id: string; kind: string; status: string }[]
          >(
            `
          SELECT s.* FROM spaces s WHERE s.personal_owner_user_id = $1 OR s.id IN
            (SELECT space_id FROM space_memberships WHERE user_id = $1) ORDER BY s.id FOR UPDATE`,
            [userId],
          );
          for (const space of spaces) {
            if (space.kind !== 'shared' || space.status !== 'active') continue;
            await tx.query(
              "UPDATE spaces SET status = 'archived' WHERE id = $1",
              [space.id],
            );
            await tx.query(
              "UPDATE space_memberships SET access_level = 'read' WHERE space_id = $1",
              [space.id],
            );
            await tx.query(
              'UPDATE users SET active_shared_space_id = NULL WHERE active_shared_space_id = $1',
              [space.id],
            );
            await tx.query(
              `INSERT INTO space_notifications
            (recipient_user_id, space_id, actor_user_id, type, title, message)
            SELECT user_id, $1, $2, 'shared_space_archived', 'Shared Space archived',
              'Deleted user archived your Shared Space. Its history is now read-only.'
            FROM space_memberships WHERE space_id = $1 AND user_id <> $2
            ON CONFLICT (recipient_user_id, space_id, type) DO NOTHING`,
              [space.id, userId],
            );
          }
          await tx.query(
            `UPDATE space_notifications SET message = 'Deleted user archived your Shared Space. Its history is now read-only.' WHERE actor_user_id = $1`,
            [userId],
          );
          await tx.query(
            'DELETE FROM space_notifications WHERE recipient_user_id = $1',
            [userId],
          );
          await tx.query('DELETE FROM space_memberships WHERE user_id = $1', [
            userId,
          ]);
          await tx.query(
            `UPDATE invitations SET status = 'revoked' WHERE sender_user_id = $1 AND status = 'pending'`,
            [userId],
          );
          await tx.query(
            `DELETE FROM invitation_claims WHERE user_id = $1 OR invitation_id IN
          (SELECT id FROM invitations WHERE sender_user_id = $1 AND status = 'revoked')`,
            [userId],
          );
          await tx.query(
            `UPDATE users SET deletion_status = 'pending', name = 'Deleted user', email = NULL,
          photo_url = NULL, active_shared_space_id = NULL, clerk_user_id = 'deleted-user-' || id::text WHERE id = $1`,
            [userId],
          );
          const repository = tx.getRepository(AccountDeletionOperationEntity);
          return repository.save(
            repository.create({
              oldClerkUserId: clerkUserId,
              userId,
              initiatingSessionId: sessionId,
            }),
          );
        });
      } catch (error) {
        if (!(error instanceof RediscoverMemberships)) throw error;
      }
    }
  }

  claim() {
    return this.manager.transaction(async (tx) => {
      const operation = await tx
        .getRepository(AccountDeletionOperationEntity)
        .createQueryBuilder('operation')
        .where(
          "operation.status = 'pending' AND operation.next_attempt_at <= CURRENT_TIMESTAMP",
        )
        .andWhere(
          '(operation.claim_expires_at IS NULL OR operation.claim_expires_at <= CURRENT_TIMESTAMP)',
        )
        .orderBy('operation.next_attempt_at', 'ASC')
        .take(1)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!operation) return null;
      operation.claimToken = randomUUID();
      operation.claimExpiresAt = new Date(Date.now() + CLAIM_DURATION_MS);
      operation.attemptCount++;
      return tx.getRepository(AccountDeletionOperationEntity).save(operation);
    });
  }

  async purgePersonalData(operation: AccountDeletionOperationRecord) {
    await this.manager.transaction(async (tx) => {
      await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        operation.userId,
      ]);
      const spaces = await tx.query<{ id: string }[]>(
        "SELECT id FROM spaces WHERE kind = 'personal' AND personal_owner_user_id = $1 ORDER BY id FOR UPDATE",
        [operation.userId],
      );
      for (const { id } of spaces) {
        // The order preserves evidence FKs and existing active-Space DELETE triggers.
        for (const table of [
          'expense_activities',
          'expenses',
          'statement_import_operations',
          'statement_imports',
          'category_rules',
        ]) {
          await tx.query(`DELETE FROM ${table} WHERE space_id = $1`, [id]);
        }
        await tx.query(
          'DELETE FROM budgets WHERE category_id IN (SELECT id FROM categories WHERE space_id = $1)',
          [id],
        );
        for (const table of [
          'categories',
          'space_memberships',
          'space_notifications',
        ])
          await tx.query(`DELETE FROM ${table} WHERE space_id = $1`, [id]);
        await tx.query('DELETE FROM spaces WHERE id = $1', [id]);
      }
    });
  }

  async checkpoint(
    operation: AccountDeletionOperationRecord,
    stage: 'personalDataPurgedAt' | 'sessionsRevokedAt' | 'providerDeletedAt',
  ) {
    await this.manager.getRepository(AccountDeletionOperationEntity).update(
      {
        oldClerkUserId: operation.oldClerkUserId,
        claimToken: operation.claimToken!,
      },
      { [stage]: new Date() },
    );
  }

  async finishAttempt(
    operation: AccountDeletionOperationRecord,
    failure: AccountDeletionFailureCode | null,
    retryAfterMs = 0,
  ) {
    await this.manager.transaction(async (tx) => {
      // Match the purge's User → operation order.
      await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        operation.userId,
      ]);
      const current = await tx
        .getRepository(AccountDeletionOperationEntity)
        .findOne({
          where: {
            oldClerkUserId: operation.oldClerkUserId,
            claimToken: operation.claimToken!,
          },
          lock: { mode: 'pessimistic_write' },
        });
      if (!current) return;
      const complete =
        !failure &&
        current.personalDataPurgedAt &&
        current.sessionsRevokedAt &&
        current.providerDeletedAt;
      current.claimToken = null;
      current.claimExpiresAt = null;
      current.lastFailureCode = complete ? null : failure;
      current.nextAttemptAt = complete
        ? null
        : new Date(
            Date.now() +
              Math.max(
                retryAfterMs,
                Math.min(
                  MAX_RETRY_MS,
                  INITIAL_RETRY_MS *
                    2 ** Math.min(current.attemptCount - 1, 8) *
                    (1 + Math.random() * 0.2),
                ),
              ),
          );
      if (complete) {
        current.status = 'completed';
        current.completedAt = new Date();
        await tx.query(
          "UPDATE users SET deletion_status = 'completed', deleted_at = $2 WHERE id = $1",
          [operation.userId, current.completedAt],
        );
      }
      await tx.getRepository(AccountDeletionOperationEntity).save(current);
    });
  }
}
