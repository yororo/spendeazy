import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceTransactionStatementImportSpace1880000000000 implements MigrationInterface {
  name = 'EnforceTransactionStatementImportSpace1880000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        invalid_transaction_id BIGINT;
        invalid_transaction_space_id BIGINT;
        invalid_statement_import_id BIGINT;
        invalid_statement_import_space_id BIGINT;
      BEGIN
        SELECT transaction_record.id,
               transaction_record.space_id,
               transaction_record.statement_import_id,
               statement_import.space_id
          INTO invalid_transaction_id,
               invalid_transaction_space_id,
               invalid_statement_import_id,
               invalid_statement_import_space_id
          FROM transactions AS transaction_record
          LEFT JOIN statement_imports AS statement_import
            ON statement_import.id = transaction_record.statement_import_id
         WHERE transaction_record.statement_import_id IS NOT NULL
           AND (
             statement_import.id IS NULL
             OR statement_import.space_id <> transaction_record.space_id
           )
         ORDER BY transaction_record.id
         LIMIT 1;

        IF invalid_transaction_id IS NOT NULL THEN
          RAISE EXCEPTION
            'Cannot enforce Transaction-to-Statement Import Space integrity: transaction % (space_id=%) references statement import % with space_id=%. Repair the transaction provenance so both records use the same Space, or clear statement_import_id for a manual Transaction, then rerun the migration.',
            invalid_transaction_id,
            invalid_transaction_space_id,
            invalid_statement_import_id,
            invalid_statement_import_space_id
            USING ERRCODE = '23514',
                  HINT = 'Find invalid rows with a LEFT JOIN from transactions to statement_imports on statement_import_id, repair each row, and rerun migration 1880000000000.';
        END IF;
      END
      $migration$;
    `);

    await queryRunner.query(`
      CREATE INDEX ix_transactions_statement_import_space
        ON transactions (statement_import_id, space_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX ix_transactions_statement_import_space',
    );
  }
}
