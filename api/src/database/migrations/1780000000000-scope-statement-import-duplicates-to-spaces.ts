import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeStatementImportDuplicatesToSpaces1780000000000 implements MigrationInterface {
  name = 'ScopeStatementImportDuplicatesToSpaces1780000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT IF EXISTS ux_statement_imports_user_file_hash',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS ux_statement_imports_user_file_hash',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_statement_imports_space_file_hash
        ON statement_imports (space_id, file_hash)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_space_import_fingerprint
        ON transactions (space_id, import_fingerprint)
    `);
    await queryRunner.query(`
      ALTER TABLE transactions
        ADD CONSTRAINT fk_transactions_statement_import_space
        FOREIGN KEY (statement_import_id, space_id)
        REFERENCES statement_imports (id, space_id)
        ON DELETE RESTRICT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_statement_import_space',
    );
    await queryRunner.query(
      'DROP INDEX ix_transactions_space_import_fingerprint',
    );
    await queryRunner.query('DROP INDEX ux_statement_imports_space_file_hash');
    await queryRunner.query(`
      ALTER TABLE statement_imports
        ADD CONSTRAINT ux_statement_imports_user_file_hash
        UNIQUE (user_id, file_hash)
    `);
  }
}
