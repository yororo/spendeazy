import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryConfigurationRevisions1980000000000 implements MigrationInterface {
  name = 'AddCategoryConfigurationRevisions1980000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
        ADD COLUMN icon_key VARCHAR(40) NOT NULL DEFAULT 'shapes',
        ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
        ADD CONSTRAINT ck_categories_icon_key_supported
          CHECK (icon_key IN (
            'utensils', 'car-front', 'bus', 'heart-pulse', 'shopping-bag',
            'ticket', 'plug-zap', 'house', 'shopping-basket',
            'heart-handshake', 'shield-plus', 'baby', 'wrench', 'smartphone',
            'shapes', 'plane', 'paw-print', 'book-open', 'dumbbell',
            'briefcase-business', 'gift', 'coffee', 'wallet', 'headphones'
          )),
        ADD CONSTRAINT ck_categories_revision_positive CHECK (revision > 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
        DROP CONSTRAINT ck_categories_revision_positive,
        DROP CONSTRAINT ck_categories_icon_key_supported,
        DROP COLUMN revision,
        DROP COLUMN icon_key
    `);
  }
}
