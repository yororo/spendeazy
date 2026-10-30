import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { inTransactionContext } from '../../database/transaction-context';
import type {
  ActiveIdentityExecution,
  IdentityExecutionMode,
} from '../application/active-identity-execution';
import {
  AccountDeletionError,
  UserNotFoundError,
} from '../application/user-errors';
import {
  lockProviderIdentity,
  withIdentityParticipants,
} from './typeorm-account-deletion-store';

@Injectable()
export class TypeOrmActiveIdentityExecution implements ActiveIdentityExecution {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}
  execute<T>(
    userId: string,
    mode: IdentityExecutionMode,
    work: () => Promise<T>,
  ): Promise<T> {
    return withIdentityParticipants(this.manager, userId, mode, async (tx) => {
      const rows = await tx.query<
        { deletion_status: 'active' | 'pending' | 'completed' }[]
      >('SELECT deletion_status FROM users WHERE id = $1', [userId]);
      const status = rows[0]?.deletion_status;
      if (!status) throw new UserNotFoundError();
      if (status !== 'active') throw new AccountDeletionError(status);
      return inTransactionContext(tx, work);
    });
  }
  provision<T>(clerkUserId: string, work: () => Promise<T>): Promise<T> {
    return this.manager.transaction(async (tx) => {
      await lockProviderIdentity(tx, clerkUserId);
      const operations = await tx.query<{ status: 'pending' | 'completed' }[]>(
        'SELECT status FROM account_deletion_operations WHERE old_clerk_user_id = $1',
        [clerkUserId],
      );
      if (operations[0]) throw new AccountDeletionError(operations[0].status);
      await tx.query(
        'SELECT id FROM users WHERE clerk_user_id = $1 ORDER BY id FOR UPDATE',
        [clerkUserId],
      );
      return inTransactionContext(tx, work);
    });
  }
}
