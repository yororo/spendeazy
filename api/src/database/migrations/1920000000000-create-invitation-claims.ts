import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvitationClaims1920000000000 implements MigrationInterface {
  name = 'CreateInvitationClaims1920000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE invitation_claims (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        invitation_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_invitation_claims PRIMARY KEY (id),
        CONSTRAINT fk_invitation_claims_invitation FOREIGN KEY (invitation_id)
          REFERENCES invitations (id) ON DELETE CASCADE,
        CONSTRAINT fk_invitation_claims_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_invitation_claims_invitation_user
        ON invitation_claims (invitation_id, user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_invitation_claims_user_created
        ON invitation_claims (user_id, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_invitation_claims_user_created');
    await queryRunner.query('DROP INDEX ux_invitation_claims_invitation_user');
    await queryRunner.query('DROP TABLE invitation_claims');
  }
}
