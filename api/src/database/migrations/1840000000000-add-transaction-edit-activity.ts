import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionEditActivity1840000000000 implements MigrationInterface {
  name = 'AddTransactionEditActivity1840000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        ADD COLUMN before_state JSONB,
        ADD COLUMN after_state JSONB
    `);
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        DROP CONSTRAINT ck_transaction_activities_type,
        ADD CONSTRAINT ck_transaction_activities_type CHECK (
          activity_type IN ('created', 'edited')
        ),
        ADD CONSTRAINT ck_transaction_activities_state CHECK (
          (activity_type = 'created' AND before_state IS NULL AND after_state IS NULL)
          OR
          (activity_type = 'edited' AND before_state IS NOT NULL AND after_state IS NOT NULL)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE transaction_activities DROP CONSTRAINT ck_transaction_activities_state',
    );
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        DROP CONSTRAINT ck_transaction_activities_type,
        ADD CONSTRAINT ck_transaction_activities_type CHECK (
          activity_type IN ('created')
        )
    `);
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        DROP COLUMN after_state,
        DROP COLUMN before_state
    `);
  }
}
