import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSpaceNotificationEmailDelivery1940000000000 implements MigrationInterface {
  name = 'RemoveSpaceNotificationEmailDelivery1940000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE space_notifications
        DROP COLUMN email_delivery_status,
        DROP COLUMN email_delivery_error
    `);
  }

  async down(): Promise<void> {
    // Email delivery state is retired and its historical values are not restored.
  }
}
