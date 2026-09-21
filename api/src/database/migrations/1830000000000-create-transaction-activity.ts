import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionActivity1830000000000 implements MigrationInterface {
  name = 'CreateTransactionActivity1830000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transaction_activities (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        transaction_id BIGINT NOT NULL,
        space_id BIGINT NOT NULL,
        actor_user_id BIGINT NOT NULL,
        activity_type VARCHAR(20) NOT NULL,
        occurred_at TIMESTAMPTZ(3) NOT NULL,
        CONSTRAINT pk_transaction_activities PRIMARY KEY (id),
        CONSTRAINT fk_transaction_activities_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE CASCADE,
        CONSTRAINT fk_transaction_activities_actor_user FOREIGN KEY (actor_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_transaction_activities_type CHECK (
          activity_type IN ('created')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transaction_activities_space_transaction_occurred_at
        ON transaction_activities (space_id, transaction_id, occurred_at, id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_transaction_activities_created
        ON transaction_activities (transaction_id)
        WHERE activity_type = 'created'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ux_transaction_activities_created');
    await queryRunner.query(
      'DROP INDEX ix_transaction_activities_space_transaction_occurred_at',
    );
    await queryRunner.query('DROP TABLE transaction_activities');
  }
}
