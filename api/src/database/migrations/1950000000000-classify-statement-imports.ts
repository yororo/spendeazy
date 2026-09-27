import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassifyStatementImports1950000000000 implements MigrationInterface {
  name = 'ClassifyStatementImports1950000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE statement_imports
        ADD COLUMN statement_type VARCHAR(30) NOT NULL DEFAULT 'credit_card',
        ADD COLUMN transaction_history_start_date DATE,
        ADD COLUMN total_debit NUMERIC(15, 2)
    `);

    await queryRunner.query(`
      UPDATE statement_imports
         SET statement_type = 'e_wallet'
       WHERE LOWER(TRIM(bank)) IN ('gcash', 'gcash e-wallet')
          OR LOWER(TRIM(card_type)) = 'e-wallet'
    `);

    await queryRunner.query(`
      ALTER TABLE statement_imports
        ADD CONSTRAINT ck_statement_imports_statement_type
          CHECK (statement_type IN ('credit_card', 'e_wallet')),
        ADD CONSTRAINT ck_statement_imports_total_debit_nonnegative
          CHECK (total_debit IS NULL OR total_debit >= 0),
        ADD CONSTRAINT ck_statement_imports_history_start_before_end
          CHECK (
            transaction_history_start_date IS NULL
            OR transaction_history_start_date <= statement_date
          )
    `);

    await queryRunner.query(`
      ALTER TABLE transactions
        ADD COLUMN reference_hash CHAR(64),
        ADD CONSTRAINT ck_transactions_reference_hash_lowercase_hmac
          CHECK (
            reference_hash IS NULL
            OR reference_hash ~ '^[0-9a-f]{64}$'
          )
    `);

    await queryRunner.query(`
      CREATE INDEX ix_transactions_space_reference_hash
        ON transactions (space_id, reference_hash)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_transactions_space_reference_hash');
    await queryRunner.query(`
      ALTER TABLE transactions
        DROP CONSTRAINT ck_transactions_reference_hash_lowercase_hmac,
        DROP COLUMN reference_hash
    `);
    await queryRunner.query(`
      ALTER TABLE statement_imports
        DROP CONSTRAINT ck_statement_imports_history_start_before_end,
        DROP CONSTRAINT ck_statement_imports_total_debit_nonnegative,
        DROP CONSTRAINT ck_statement_imports_statement_type,
        DROP COLUMN total_debit,
        DROP COLUMN transaction_history_start_date,
        DROP COLUMN statement_type
    `);
  }
}
