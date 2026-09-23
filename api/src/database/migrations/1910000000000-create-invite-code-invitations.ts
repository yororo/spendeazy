import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInviteCodeInvitations1910000000000 implements MigrationInterface {
  name = 'CreateInviteCodeInvitations1910000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE invitations (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        sender_user_id BIGINT NOT NULL,
        code_hash VARCHAR(64) NOT NULL,
        code_ciphertext VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ(3) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_invitations PRIMARY KEY (id),
        CONSTRAINT fk_invitations_sender_user FOREIGN KEY (sender_user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT ck_invitations_status CHECK (
          status IN ('pending', 'accepted', 'revoked', 'expired')
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_invitations_sender_pending
        ON invitations (sender_user_id)
        WHERE status = 'pending'
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX ux_invitations_code_hash ON invitations (code_hash)',
    );
    await queryRunner.query(`
      CREATE INDEX ix_invitations_sender_status
        ON invitations (sender_user_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_invitations_sender_status');
    await queryRunner.query('DROP INDEX ux_invitations_code_hash');
    await queryRunner.query('DROP INDEX ux_invitations_sender_pending');
    await queryRunner.query('DROP TABLE invitations');
  }
}
