import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  AccountDeletionFailureCode,
  AccountDeletionOperationRecord,
  AccountDeletionStatus,
} from '../../users/application/account-deletion-operation';

@Entity({ name: 'account_deletion_operations' })
@Index('ux_account_deletion_operations_user', ['userId'], { unique: true })
@Index('ix_account_deletion_operations_due', ['nextAttemptAt'], {
  where: "status = 'pending'",
})
export class AccountDeletionOperationEntity implements AccountDeletionOperationRecord {
  @PrimaryColumn({ type: 'varchar', length: 255, name: 'old_clerk_user_id' })
  oldClerkUserId!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 255, name: 'initiating_session_id' })
  initiatingSessionId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: AccountDeletionStatus;

  @Column({
    type: 'timestamptz',
    precision: 3,
    name: 'accepted_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  acceptedAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'personal_data_purged_at',
  })
  personalDataPurgedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'sessions_revoked_at',
  })
  sessionsRevokedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'provider_deleted_at',
  })
  providerDeletedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'completed_at',
  })
  completedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'next_attempt_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextAttemptAt!: Date | null;

  @Column({ type: 'integer', default: 0, name: 'attempt_count' })
  attemptCount!: number;

  @Column({ type: 'uuid', nullable: true, name: 'claim_token' })
  claimToken!: string | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'claim_expires_at',
  })
  claimExpiresAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
    name: 'last_failure_code',
  })
  lastFailureCode!: AccountDeletionFailureCode | null;
}
