import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvitations1820000000000 implements MigrationInterface {
  name = 'CreateInvitations1820000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE invitations (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        sender_user_id BIGINT NOT NULL,
        recipient_email VARCHAR(320) NOT NULL,
        recipient_user_id BIGINT,
        token_hash VARCHAR(128) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ(3) NOT NULL,
        last_sent_at TIMESTAMPTZ(3),
        delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        delivery_error VARCHAR(500),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_invitations PRIMARY KEY (id),
        CONSTRAINT fk_invitations_sender_user FOREIGN KEY (sender_user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_invitations_recipient_user FOREIGN KEY (recipient_user_id)
          REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT ck_invitations_status CHECK (
          status IN ('pending', 'canceled', 'declined', 'expired')
        ),
        CONSTRAINT ck_invitations_delivery_status CHECK (
          delivery_status IN ('pending', 'sent', 'failed')
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_invitations_sender_pending
        ON invitations (sender_user_id)
        WHERE status = 'pending'
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX ux_invitations_token_hash ON invitations (token_hash)',
    );
    await queryRunner.query(`
      CREATE INDEX ix_invitations_recipient_email_status
        ON invitations (recipient_email, status)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_invitations_recipient_user_status
        ON invitations (recipient_user_id, status)
    `);
    await queryRunner.query(`
      CREATE TABLE invitation_delivery_attempts (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        invitation_id BIGINT NOT NULL,
        sender_user_id BIGINT NOT NULL,
        attempted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        succeeded BOOLEAN NOT NULL,
        error VARCHAR(500),
        CONSTRAINT pk_invitation_delivery_attempts PRIMARY KEY (id),
        CONSTRAINT fk_invitation_delivery_attempts_invitation
          FOREIGN KEY (invitation_id) REFERENCES invitations (id) ON DELETE CASCADE,
        CONSTRAINT fk_invitation_delivery_attempts_sender
          FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_invitation_delivery_attempts_sender_attempted_at
        ON invitation_delivery_attempts (sender_user_id, attempted_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX ix_invitation_delivery_attempts_sender_attempted_at',
    );
    await queryRunner.query('DROP TABLE invitation_delivery_attempts');
    await queryRunner.query('DROP INDEX ix_invitations_recipient_user_status');
    await queryRunner.query('DROP INDEX ix_invitations_recipient_email_status');
    await queryRunner.query('DROP INDEX ux_invitations_token_hash');
    await queryRunner.query('DROP INDEX ux_invitations_sender_pending');
    await queryRunner.query('DROP TABLE invitations');
  }
}
