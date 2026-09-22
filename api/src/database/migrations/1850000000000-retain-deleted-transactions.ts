import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RetainDeletedTransactions1850000000000 implements MigrationInterface {
  name = 'RetainDeletedTransactions1850000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
        ADD COLUMN deleted_at TIMESTAMPTZ(3)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_space_deleted_purchase_date
        ON transactions (space_id, deleted_at, purchase_date, id)
    `);
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        DROP CONSTRAINT ck_transaction_activities_type,
        ADD CONSTRAINT ck_transaction_activities_type CHECK (
          activity_type IN ('created', 'edited', 'deleted')
        ),
        DROP CONSTRAINT ck_transaction_activities_state,
        ADD CONSTRAINT ck_transaction_activities_state CHECK (
          (activity_type = 'created' AND before_state IS NULL AND after_state IS NULL)
          OR
          (activity_type = 'edited' AND before_state IS NOT NULL AND after_state IS NOT NULL)
          OR
          (activity_type = 'deleted' AND before_state IS NULL AND after_state IS NULL)
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_activities
        DROP CONSTRAINT ck_transaction_activities_state,
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
    await queryRunner.query(
      'DROP INDEX ix_transactions_space_deleted_purchase_date',
    );
    await queryRunner.query('ALTER TABLE transactions DROP COLUMN deleted_at');
  }
}
