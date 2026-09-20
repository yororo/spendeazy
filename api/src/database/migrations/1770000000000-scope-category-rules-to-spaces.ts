import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeCategoryRulesToSpaces1770000000000 implements MigrationInterface {
  name = 'ScopeCategoryRulesToSpaces1770000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE spaces
        ADD COLUMN category_rules_revision BIGINT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(
      'ALTER TABLE category_rules DROP CONSTRAINT IF EXISTS ux_category_rules_user_match_pattern',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS ux_category_rules_user_match_pattern',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_category_rules_space_match_pattern
        ON category_rules (space_id, match_type, normalized_pattern)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS ux_category_rules_space_match_pattern',
    );
    await queryRunner.query(`
      ALTER TABLE category_rules
        ADD CONSTRAINT ux_category_rules_user_match_pattern
        UNIQUE (user_id, match_type, normalized_pattern)
    `);
    await queryRunner.query(
      'ALTER TABLE spaces DROP COLUMN category_rules_revision',
    );
  }
}
