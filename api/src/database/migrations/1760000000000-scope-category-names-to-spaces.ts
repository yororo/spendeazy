import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeCategoryNamesToSpaces1760000000000 implements MigrationInterface {
  name = 'ScopeCategoryNamesToSpaces1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ux_categories_user_name');
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_categories_space_name
        ON categories (space_id, LOWER(name))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ux_categories_space_name');
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_categories_user_name
        ON categories (user_id, LOWER(name))
    `);
  }
}
