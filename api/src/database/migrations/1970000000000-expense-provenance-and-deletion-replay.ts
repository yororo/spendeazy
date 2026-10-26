import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpenseProvenanceAndDeletionReplay1970000000000 implements MigrationInterface {
  name = 'ExpenseProvenanceAndDeletionReplay1970000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expenses
        ADD COLUMN source_row_id TEXT,
        ADD COLUMN deleted_by_user_id BIGINT,
        ADD COLUMN deleted_from_revision BIGINT,
        ADD CONSTRAINT ck_expenses_source_row_requires_import
          CHECK (
            source_row_id IS NULL
            OR (statement_import_id IS NOT NULL AND btrim(source_row_id) <> '')
          ),
        ADD CONSTRAINT ck_expenses_deleted_actor_revision
          CHECK (
            (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deleted_from_revision IS NULL)
            OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NULL AND deleted_from_revision IS NULL)
            OR (
              deleted_at IS NOT NULL
              AND deleted_by_user_id IS NOT NULL
              AND deleted_from_revision IS NOT NULL
              AND deleted_from_revision > 0
              AND revision = deleted_from_revision + 1
            )
          ),
        ADD CONSTRAINT fk_expenses_deleted_by_user
          FOREIGN KEY (deleted_by_user_id)
          REFERENCES users (id)
          ON DELETE RESTRICT;

      CREATE UNIQUE INDEX ux_expenses_statement_import_source_row
        ON expenses (statement_import_id, source_row_id)
        WHERE statement_import_id IS NOT NULL AND source_row_id IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX ux_expenses_statement_import_source_row;
      ALTER TABLE expenses
        DROP CONSTRAINT fk_expenses_deleted_by_user,
        DROP CONSTRAINT ck_expenses_deleted_actor_revision,
        DROP CONSTRAINT ck_expenses_source_row_requires_import,
        DROP COLUMN deleted_from_revision,
        DROP COLUMN deleted_by_user_id,
        DROP COLUMN source_row_id;
    `);
  }
}
