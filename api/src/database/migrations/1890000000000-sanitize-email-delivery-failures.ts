import type { MigrationInterface, QueryRunner } from 'typeorm';

import { SAFE_EMAIL_DELIVERY_FAILURE } from '../../email-delivery/email-delivery-failure';

export class SanitizeEmailDeliveryFailures1890000000000 implements MigrationInterface {
  name = 'SanitizeEmailDeliveryFailures1890000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE invitations SET delivery_error = $1 WHERE delivery_error IS NOT NULL',
      [SAFE_EMAIL_DELIVERY_FAILURE],
    );
    await queryRunner.query(
      'UPDATE invitation_delivery_attempts SET error = $1 WHERE error IS NOT NULL',
      [SAFE_EMAIL_DELIVERY_FAILURE],
    );
    await queryRunner.query(
      'UPDATE space_notifications SET email_delivery_error = $1 WHERE email_delivery_error IS NOT NULL',
      [SAFE_EMAIL_DELIVERY_FAILURE],
    );
  }

  async down(): Promise<void> {
    // The migration intentionally removes data that must never be exposed again.
  }
}
