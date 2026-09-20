import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyFinancialReferenceConstraints1790000000000 implements MigrationInterface {
  name = 'RemoveLegacyFinancialReferenceConstraints1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
        DROP CONSTRAINT fk_transactions_category_user,
        DROP CONSTRAINT fk_transactions_statement_import_user
    `);
    await queryRunner.query(`
      ALTER TABLE category_rules
        DROP CONSTRAINT fk_category_rules_category_user
    `);
    await queryRunner.query(
      'ALTER TABLE categories DROP CONSTRAINT uq_categories_id_user_id',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT uq_statement_imports_id_user_id',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
        ADD CONSTRAINT uq_categories_id_user_id UNIQUE (id, user_id)
    `);
    await queryRunner.query(`
      ALTER TABLE statement_imports
        ADD CONSTRAINT uq_statement_imports_id_user_id UNIQUE (id, user_id)
    `);
    await queryRunner.query(`
      ALTER TABLE category_rules
        ADD CONSTRAINT fk_category_rules_category_user
        FOREIGN KEY (category_id, user_id)
        REFERENCES categories (id, user_id)
        ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE transactions
        ADD CONSTRAINT fk_transactions_category_user
          FOREIGN KEY (category_id, user_id)
          REFERENCES categories (id, user_id)
          ON DELETE SET NULL (category_id),
        ADD CONSTRAINT fk_transactions_statement_import_user
          FOREIGN KEY (statement_import_id, user_id)
          REFERENCES statement_imports (id, user_id)
          ON DELETE RESTRICT
    `);
  }
}
