import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportContainsCategoryRules1720000000000 implements MigrationInterface {
  name = 'SupportContainsCategoryRules1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE category_rules
      DROP CONSTRAINT ck_category_rules_match_type,
      ADD CONSTRAINT ck_category_rules_match_type CHECK (match_type IN ('exact', 'contains'))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse rollback while Contains rules exist instead of deleting user data.
    await queryRunner.query(`ALTER TABLE category_rules
      DROP CONSTRAINT ck_category_rules_match_type,
      ADD CONSTRAINT ck_category_rules_match_type CHECK (match_type IN ('exact'))`);
  }
}
