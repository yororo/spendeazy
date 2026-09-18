import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryColor1740000000000 implements MigrationInterface {
  name = 'AddCategoryColor1740000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
        ADD COLUMN color VARCHAR(32)
    `);
    await queryRunner.query(`
      ALTER TABLE categories
        ADD CONSTRAINT ck_categories_color_supported
        CHECK (color IN (
          'coral', 'scarlet', 'crimson', 'rose', 'magenta', 'orchid',
          'plum', 'violet', 'indigo', 'cobalt', 'azure', 'sky', 'cyan',
          'teal', 'emerald', 'forest', 'lime', 'olive', 'gold', 'amber',
          'copper', 'cocoa', 'slate', 'steel'
        ))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE categories DROP CONSTRAINT ck_categories_color_supported',
    );
    await queryRunner.query('ALTER TABLE categories DROP COLUMN color');
  }
}
