import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IntroducePersonalSpaces1750000000000 implements MigrationInterface {
  name = 'IntroducePersonalSpaces1750000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE spaces (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        kind VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        personal_owner_user_id BIGINT,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_spaces PRIMARY KEY (id),
        CONSTRAINT fk_spaces_personal_owner_user FOREIGN KEY (personal_owner_user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT ck_spaces_kind_status CHECK (kind IN ('personal', 'shared')),
        CONSTRAINT ck_spaces_status CHECK (status IN ('active', 'archived')),
        CONSTRAINT ck_spaces_kind_owner CHECK (
          (kind = 'personal' AND personal_owner_user_id IS NOT NULL)
          OR (kind = 'shared' AND personal_owner_user_id IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_spaces_personal_owner
        ON spaces (personal_owner_user_id)
        WHERE kind = 'personal'
    `);
    await queryRunner.query(`
      CREATE TABLE space_memberships (
        space_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        access_level VARCHAR(20) NOT NULL,
        joined_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_space_memberships PRIMARY KEY (space_id, user_id),
        CONSTRAINT fk_space_memberships_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE CASCADE,
        CONSTRAINT fk_space_memberships_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT ck_space_memberships_access_level CHECK (
          access_level IN ('read', 'write')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_space_memberships_user_access
        ON space_memberships (user_id, access_level)
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN active_shared_space_id BIGINT
    `);
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT fk_users_active_shared_space
        FOREIGN KEY (active_shared_space_id)
        REFERENCES spaces (id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX ix_users_active_shared_space
        ON users (active_shared_space_id)
    `);

    await queryRunner.query(
      'ALTER TABLE categories ADD COLUMN space_id BIGINT',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports ADD COLUMN space_id BIGINT',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports ADD COLUMN imported_by_user_id BIGINT',
    );
    await queryRunner.query(
      'ALTER TABLE transactions ADD COLUMN space_id BIGINT',
    );
    await queryRunner.query(
      'ALTER TABLE transactions ADD COLUMN added_by_user_id BIGINT',
    );
    await queryRunner.query(
      'ALTER TABLE category_rules ADD COLUMN space_id BIGINT',
    );

    await queryRunner.query(`
      INSERT INTO spaces (kind, status, personal_owner_user_id)
      SELECT 'personal', 'active', id
      FROM users
      ON CONFLICT (personal_owner_user_id) WHERE kind = 'personal' DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO space_memberships (space_id, user_id, access_level)
      SELECT id, personal_owner_user_id, 'write'
      FROM spaces
      WHERE kind = 'personal'
      ON CONFLICT (space_id, user_id) DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE categories AS record
      SET space_id = space.id
      FROM spaces AS space
      WHERE space.kind = 'personal'
        AND space.personal_owner_user_id = record.user_id
    `);
    await queryRunner.query(`
      UPDATE statement_imports AS record
      SET space_id = space.id
      FROM spaces AS space
      WHERE space.kind = 'personal'
        AND space.personal_owner_user_id = record.user_id
    `);
    await queryRunner.query(
      'UPDATE statement_imports SET imported_by_user_id = user_id',
    );
    await queryRunner.query(`
      UPDATE transactions AS record
      SET space_id = space.id
      FROM spaces AS space
      WHERE space.kind = 'personal'
        AND space.personal_owner_user_id = record.user_id
    `);
    await queryRunner.query(`
      UPDATE category_rules AS record
      SET space_id = space.id
      FROM spaces AS space
      WHERE space.kind = 'personal'
        AND space.personal_owner_user_id = record.user_id
    `);
    await queryRunner.query(
      'UPDATE transactions SET added_by_user_id = user_id',
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_personal_space_for_user(target_user_id BIGINT)
      RETURNS BIGINT
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        personal_space_id BIGINT;
      BEGIN
        INSERT INTO spaces (kind, status, personal_owner_user_id)
        VALUES ('personal', 'active', target_user_id)
        ON CONFLICT (personal_owner_user_id) WHERE kind = 'personal' DO NOTHING;

        SELECT id INTO personal_space_id
        FROM spaces
        WHERE kind = 'personal'
          AND personal_owner_user_id = target_user_id;

        IF personal_space_id IS NULL THEN
          RAISE EXCEPTION 'Personal Space is unavailable for User %', target_user_id
            USING ERRCODE = '23503';
        END IF;

        INSERT INTO space_memberships (space_id, user_id, access_level)
        VALUES (personal_space_id, target_user_id, 'write')
        ON CONFLICT (space_id, user_id) DO NOTHING;

        RETURN personal_space_id;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_legacy_personal_space()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF NEW.space_id IS NULL THEN
          NEW.space_id := ensure_personal_space_for_user(NEW.user_id);
        END IF;

        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_legacy_transaction_attribution()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF NEW.added_by_user_id IS NULL THEN
          NEW.added_by_user_id := NEW.user_id;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_legacy_import_attribution()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF NEW.imported_by_user_id IS NULL THEN
          NEW.imported_by_user_id := NEW.user_id;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    for (const table of [
      'categories',
      'statement_imports',
      'transactions',
      'category_rules',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_legacy_personal_space
        BEFORE INSERT OR UPDATE OF user_id, space_id ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ensure_legacy_personal_space()
      `);
    }
    await queryRunner.query(`
      CREATE TRIGGER transactions_legacy_attribution
      BEFORE INSERT OR UPDATE OF user_id, added_by_user_id ON transactions
      FOR EACH ROW EXECUTE FUNCTION ensure_legacy_transaction_attribution()
    `);
    await queryRunner.query(`
      CREATE TRIGGER statement_imports_legacy_attribution
      BEFORE INSERT OR UPDATE OF user_id, imported_by_user_id
        ON statement_imports
      FOR EACH ROW EXECUTE FUNCTION ensure_legacy_import_attribution()
    `);

    await queryRunner.query(`
      ALTER TABLE categories
        ALTER COLUMN space_id SET NOT NULL,
        ADD CONSTRAINT uq_categories_id_space_id UNIQUE (id, space_id),
        ADD CONSTRAINT fk_categories_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE statement_imports
        ALTER COLUMN space_id SET NOT NULL,
        ALTER COLUMN imported_by_user_id SET NOT NULL,
        ADD CONSTRAINT uq_statement_imports_id_space_id UNIQUE (id, space_id),
        ADD CONSTRAINT fk_statement_imports_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_statement_imports_imported_by_user
          FOREIGN KEY (imported_by_user_id)
          REFERENCES users (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE transactions
        ALTER COLUMN space_id SET NOT NULL,
        ALTER COLUMN added_by_user_id SET NOT NULL,
        ADD CONSTRAINT fk_transactions_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_transactions_added_by_user
          FOREIGN KEY (added_by_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_transactions_category_space
          FOREIGN KEY (category_id, space_id)
          REFERENCES categories (id, space_id)
          ON DELETE SET NULL (category_id)
    `);
    await queryRunner.query(`
      ALTER TABLE category_rules
        ALTER COLUMN space_id SET NOT NULL,
        ADD CONSTRAINT fk_category_rules_space FOREIGN KEY (space_id)
          REFERENCES spaces (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_category_rules_category_space
          FOREIGN KEY (category_id, space_id)
          REFERENCES categories (id, space_id)
          ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX ix_categories_space_active
        ON categories (space_id, is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_statement_imports_space_statement_date
        ON statement_imports (space_id, statement_date)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_statement_imports_imported_by_user
        ON statement_imports (imported_by_user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_space_purchase_date
        ON transactions (space_id, purchase_date)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_space_category_purchase_date
        ON transactions (space_id, category_id, purchase_date)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_added_by_user
        ON transactions (added_by_user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_category_rules_space
        ON category_rules (space_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'categories',
      'statement_imports',
      'transactions',
      'category_rules',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER ${table}_legacy_personal_space ON ${table}`,
      );
    }
    await queryRunner.query(
      'DROP TRIGGER transactions_legacy_attribution ON transactions',
    );
    await queryRunner.query(
      'DROP TRIGGER statement_imports_legacy_attribution ON statement_imports',
    );
    await queryRunner.query('DROP FUNCTION ensure_legacy_personal_space()');
    await queryRunner.query(
      'DROP FUNCTION ensure_legacy_transaction_attribution()',
    );
    await queryRunner.query('DROP FUNCTION ensure_legacy_import_attribution()');
    await queryRunner.query(
      'DROP FUNCTION ensure_personal_space_for_user(BIGINT)',
    );

    await queryRunner.query(
      'ALTER TABLE category_rules DROP CONSTRAINT fk_category_rules_category_space',
    );
    await queryRunner.query(
      'ALTER TABLE category_rules DROP CONSTRAINT fk_category_rules_space',
    );
    await queryRunner.query('DROP INDEX ix_category_rules_space');
    await queryRunner.query('ALTER TABLE category_rules DROP COLUMN space_id');

    await queryRunner.query(
      'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_category_space',
    );
    await queryRunner.query(
      'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_space',
    );
    await queryRunner.query(
      'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_added_by_user',
    );
    await queryRunner.query(
      'DROP INDEX ix_transactions_space_category_purchase_date',
    );
    await queryRunner.query('DROP INDEX ix_transactions_added_by_user');
    await queryRunner.query('DROP INDEX ix_transactions_space_purchase_date');
    await queryRunner.query('ALTER TABLE transactions DROP COLUMN space_id');
    await queryRunner.query(
      'ALTER TABLE transactions DROP COLUMN added_by_user_id',
    );

    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT fk_statement_imports_space',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT fk_statement_imports_imported_by_user',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP CONSTRAINT uq_statement_imports_id_space_id',
    );
    await queryRunner.query(
      'DROP INDEX ix_statement_imports_space_statement_date',
    );
    await queryRunner.query('DROP INDEX ix_statement_imports_imported_by_user');
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP COLUMN space_id',
    );
    await queryRunner.query(
      'ALTER TABLE statement_imports DROP COLUMN imported_by_user_id',
    );

    await queryRunner.query(
      'ALTER TABLE categories DROP CONSTRAINT fk_categories_space',
    );
    await queryRunner.query(
      'ALTER TABLE categories DROP CONSTRAINT uq_categories_id_space_id',
    );
    await queryRunner.query('DROP INDEX ix_categories_space_active');
    await queryRunner.query('ALTER TABLE categories DROP COLUMN space_id');

    await queryRunner.query('DROP INDEX ix_users_active_shared_space');
    await queryRunner.query(
      'ALTER TABLE users DROP CONSTRAINT fk_users_active_shared_space',
    );
    await queryRunner.query(
      'ALTER TABLE users DROP COLUMN active_shared_space_id',
    );
    await queryRunner.query('DROP TABLE space_memberships');
    await queryRunner.query('DROP TABLE spaces');
  }
}
