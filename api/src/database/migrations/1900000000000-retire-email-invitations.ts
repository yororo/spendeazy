import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RetireEmailInvitations1900000000000 implements MigrationInterface {
  name = 'RetireEmailInvitations1900000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS invitation_delivery_attempts',
    );
    await queryRunner.query('DROP TABLE IF EXISTS invitations');
  }

  async down(): Promise<void> {
    // The retired email-invitation schema is intentionally not restored.
  }
}
