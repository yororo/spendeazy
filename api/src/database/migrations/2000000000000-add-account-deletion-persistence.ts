import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountDeletionPersistence2000000000000 implements MigrationInterface {
  name = 'AddAccountDeletionPersistence2000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ALTER COLUMN email DROP NOT NULL,
        ADD COLUMN photo_url TEXT,
        ADD COLUMN deletion_status VARCHAR(20) NOT NULL DEFAULT 'active';

      -- Historical local deletions have no durable provider operation. Do not
      -- invent an old provider ID or claim provider cleanup for those records.
      UPDATE users SET deletion_status = 'completed', email = NULL,
        name = 'Deleted user', photo_url = NULL WHERE deleted_at IS NOT NULL;

      ALTER TABLE users
        ADD CONSTRAINT ck_users_deletion_status CHECK (
          deletion_status IN ('active', 'pending', 'completed')
        ),
        ADD CONSTRAINT ck_users_deletion_profile CHECK (
          (deletion_status = 'active' AND email IS NOT NULL AND deleted_at IS NULL)
          OR (deletion_status = 'pending' AND email IS NULL
            AND photo_url IS NULL AND name = 'Deleted user' AND deleted_at IS NULL)
          OR (deletion_status = 'completed' AND email IS NULL
            AND photo_url IS NULL AND name = 'Deleted user' AND deleted_at IS NOT NULL)
        );

      CREATE TABLE account_deletion_operations (
        old_clerk_user_id VARCHAR(255) NOT NULL,
        user_id BIGINT NOT NULL,
        initiating_session_id VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        accepted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        personal_data_purged_at TIMESTAMPTZ(3),
        sessions_revoked_at TIMESTAMPTZ(3),
        provider_deleted_at TIMESTAMPTZ(3),
        completed_at TIMESTAMPTZ(3),
        next_attempt_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        claim_token UUID,
        claim_expires_at TIMESTAMPTZ(3),
        last_failure_code VARCHAR(40),
        CONSTRAINT pk_account_deletion_operations PRIMARY KEY (old_clerk_user_id),
        CONSTRAINT fk_account_deletion_operations_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT ck_account_deletion_operations_identity CHECK (
          length(trim(old_clerk_user_id)) > 0 AND length(trim(initiating_session_id)) > 0
        ),
        CONSTRAINT ck_account_deletion_operations_status CHECK (
          (status = 'pending' AND completed_at IS NULL AND next_attempt_at IS NOT NULL)
          OR (status = 'completed' AND completed_at IS NOT NULL
            AND personal_data_purged_at IS NOT NULL AND sessions_revoked_at IS NOT NULL
            AND provider_deleted_at IS NOT NULL AND next_attempt_at IS NULL
            AND claim_token IS NULL AND claim_expires_at IS NULL AND last_failure_code IS NULL)
        ),
        CONSTRAINT ck_account_deletion_operations_checkpoints CHECK (
          (personal_data_purged_at IS NULL OR personal_data_purged_at >= accepted_at)
          AND (sessions_revoked_at IS NULL OR sessions_revoked_at >= accepted_at)
          AND (provider_deleted_at IS NULL OR provider_deleted_at >= accepted_at)
          AND (completed_at IS NULL OR (
            completed_at >= personal_data_purged_at AND completed_at >= sessions_revoked_at
            AND completed_at >= provider_deleted_at))
        ),
        CONSTRAINT ck_account_deletion_operations_attempt_count CHECK (attempt_count >= 0),
        CONSTRAINT ck_account_deletion_operations_claim CHECK (
          (claim_token IS NULL AND claim_expires_at IS NULL)
          OR (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL
            AND claim_expires_at > accepted_at AND status = 'pending')
        ),
        CONSTRAINT ck_account_deletion_operations_failure CHECK (
          last_failure_code IS NULL OR last_failure_code IN (
            'provider_unavailable', 'provider_rate_limited', 'provider_configuration',
            'personal_cleanup_failed', 'reconciliation_failed'
          )
        )
      );
      CREATE UNIQUE INDEX ux_account_deletion_operations_user
        ON account_deletion_operations (user_id);
      CREATE INDEX ix_account_deletion_operations_due
        ON account_deletion_operations (next_attempt_at) WHERE status = 'pending';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // A rollback must never discard an accepted identity fence or restore PII.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM account_deletion_operations)
          OR EXISTS (SELECT 1 FROM users WHERE email IS NULL) THEN
          RAISE EXCEPTION 'Cannot revert account deletion persistence with retained deletion state';
        END IF;
      END $$;
      DROP TABLE account_deletion_operations;
      ALTER TABLE users
        DROP CONSTRAINT ck_users_deletion_profile,
        DROP CONSTRAINT ck_users_deletion_status,
        DROP COLUMN deletion_status,
        DROP COLUMN photo_url,
        ALTER COLUMN email SET NOT NULL;
    `);
  }
}
