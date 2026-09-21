import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyFinancialUserOwnership1810000000000 implements MigrationInterface {
  name = 'RemoveLegacyFinancialUserOwnership1810000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_transactions_user_purchase_date');
    await queryRunner.query(
      'DROP INDEX ix_transactions_user_category_purchase_date',
    );
    await queryRunner.query(
      'DROP INDEX ix_transactions_user_import_fingerprint',
    );
    await queryRunner.query(
      'DROP INDEX ix_statement_imports_user_statement_date',
    );
    await queryRunner.query('DROP INDEX ix_categories_user_active');

    await queryRunner.query(
      'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_user',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT fk_statement_imports_user',
    );
    await queryRunner.query(
      'ALTER TABLE category_rules DROP CONSTRAINT fk_category_rules_user',
    );
    await queryRunner.query(
      'ALTER TABLE categories DROP CONSTRAINT fk_categories_user',
    );

    await queryRunner.query('ALTER TABLE transactions DROP COLUMN user_id');
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP COLUMN user_id',
    );
    await queryRunner.query('ALTER TABLE category_rules DROP COLUMN user_id');
    await queryRunner.query('ALTER TABLE categories DROP COLUMN user_id');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'categories',
      'category_rules',
      'statement_imports',
      'transactions',
    ]) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN user_id BIGINT`);
    }

    await queryRunner.query(`
      UPDATE categories c SET user_id = (
        SELECT sm.user_id FROM space_memberships sm
        WHERE sm.space_id = c.space_id ORDER BY sm.user_id LIMIT 1
      )
    `);
    await queryRunner.query(`
      UPDATE category_rules cr SET user_id = (
        SELECT sm.user_id FROM space_memberships sm
        WHERE sm.space_id = cr.space_id ORDER BY sm.user_id LIMIT 1
      )
    `);
    await queryRunner.query(
      'UPDATE statement_imports SET user_id = imported_by_user_id',
    );
    await queryRunner.query(
      'UPDATE transactions SET user_id = added_by_user_id',
    );

    for (const table of [
      'categories',
      'category_rules',
      'statement_imports',
      'transactions',
    ]) {
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE categories ADD CONSTRAINT fk_categories_user
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE category_rules ADD CONSTRAINT fk_category_rules_user
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE statement_imports ADD CONSTRAINT fk_statement_imports_user
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE transactions ADD CONSTRAINT fk_transactions_user
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    `);

    await queryRunner.query(
      'CREATE INDEX ix_categories_user_active ON categories (user_id, is_active)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_statement_imports_user_statement_date ON statement_imports (user_id, statement_date)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_transactions_user_purchase_date ON transactions (user_id, purchase_date)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_transactions_user_category_purchase_date ON transactions (user_id, category_id, purchase_date)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_transactions_user_import_fingerprint ON transactions (user_id, import_fingerprint)',
    );
  }
}
