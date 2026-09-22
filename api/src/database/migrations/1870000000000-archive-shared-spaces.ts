import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveSharedSpaces1870000000000 implements MigrationInterface {
  name = 'ArchiveSharedSpaces1870000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN deleted_at TIMESTAMPTZ(3)
    `);
    await queryRunner.query(
      'CREATE INDEX ix_users_deleted_at ON users (deleted_at)',
    );

    await queryRunner.query(`
      CREATE TABLE space_notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        recipient_user_id BIGINT NOT NULL,
        space_id BIGINT NOT NULL,
        actor_user_id BIGINT,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message VARCHAR(500) NOT NULL,
        read_at TIMESTAMPTZ(3),
        email_delivery_status VARCHAR(20) NOT NULL,
        email_delivery_error VARCHAR(500),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_space_notifications PRIMARY KEY (id),
        CONSTRAINT fk_space_notifications_recipient
          FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_space_notifications_space
          FOREIGN KEY (space_id) REFERENCES spaces (id) ON DELETE RESTRICT,
        CONSTRAINT fk_space_notifications_actor
          FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT ck_space_notifications_type
          CHECK (type IN ('shared_space_archived')),
        CONSTRAINT ck_space_notifications_delivery_status
          CHECK (email_delivery_status IN ('pending', 'sent', 'failed'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_space_notifications_recipient_created
        ON space_notifications (recipient_user_id, created_at)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_space_notifications_archive_recipient_space
        ON space_notifications (recipient_user_id, space_id, type)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION reject_archived_space_write()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        target_space_id BIGINT;
        current_status VARCHAR(20);
      BEGIN
        IF TG_TABLE_NAME = 'budgets' THEN
          target_space_id := (
            SELECT c.space_id
            FROM categories c
            WHERE c.id = COALESCE(NEW.category_id, OLD.category_id)
          );
        ELSE
          target_space_id := COALESCE(NEW.space_id, OLD.space_id);
        END IF;

        IF target_space_id IS NULL THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END IF;

        SELECT s.status INTO current_status
        FROM spaces s
        WHERE s.id = target_space_id
        FOR UPDATE;

        IF current_status IS DISTINCT FROM 'active' THEN
          RAISE EXCEPTION 'SPACE_NOT_WRITABLE'
            USING ERRCODE = 'PZ001';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);

    for (const table of [
      'categories',
      'budgets',
      'statement_imports',
      'transactions',
      'category_rules',
      'transaction_activities',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_reject_archived_space_write
        BEFORE INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION reject_archived_space_write()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'categories',
      'budgets',
      'statement_imports',
      'transactions',
      'category_rules',
      'transaction_activities',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER ${table}_reject_archived_space_write ON ${table}`,
      );
    }
    await queryRunner.query('DROP FUNCTION reject_archived_space_write()');
    await queryRunner.query(
      'DROP INDEX ux_space_notifications_archive_recipient_space',
    );
    await queryRunner.query(
      'DROP INDEX ix_space_notifications_recipient_created',
    );
    await queryRunner.query('DROP TABLE space_notifications');
    await queryRunner.query('DROP INDEX ix_users_deleted_at');
    await queryRunner.query('ALTER TABLE users DROP COLUMN deleted_at');
  }
}
