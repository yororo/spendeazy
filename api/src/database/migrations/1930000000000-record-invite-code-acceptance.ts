import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordInviteCodeAcceptance1930000000000 implements MigrationInterface {
  name = 'RecordInviteCodeAcceptance1930000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invitations
        ADD COLUMN accepted_space_id BIGINT,
        ADD CONSTRAINT fk_invitations_accepted_space
          FOREIGN KEY (accepted_space_id) REFERENCES spaces (id) ON DELETE RESTRICT,
        ADD CONSTRAINT ck_invitations_accepted_space CHECK (
          (status = 'accepted' AND accepted_space_id IS NOT NULL)
          OR status <> 'accepted'
        )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_invitations_accepted_space ON invitations (accepted_space_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_invitations_accepted_space');
    await queryRunner.query(
      'ALTER TABLE invitations DROP CONSTRAINT ck_invitations_accepted_space',
    );
    await queryRunner.query(
      'ALTER TABLE invitations DROP CONSTRAINT fk_invitations_accepted_space',
    );
    await queryRunner.query(
      'ALTER TABLE invitations DROP COLUMN accepted_space_id',
    );
  }
}
