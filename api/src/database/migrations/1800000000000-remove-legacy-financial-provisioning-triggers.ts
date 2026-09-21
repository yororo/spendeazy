import type { MigrationInterface, QueryRunner } from 'typeorm';

const financialTables = [
  'categories',
  'statement_imports',
  'transactions',
  'category_rules',
];

export class RemoveLegacyFinancialProvisioningTriggers1800000000000 implements MigrationInterface {
  name = 'RemoveLegacyFinancialProvisioningTriggers1800000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of financialTables) {
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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION ensure_personal_space_for_user(target_user_id BIGINT)
      RETURNS BIGINT LANGUAGE plpgsql AS $function$
      DECLARE personal_space_id BIGINT;
      BEGIN
        INSERT INTO spaces (kind, status, personal_owner_user_id)
        VALUES ('personal', 'active', target_user_id)
        ON CONFLICT (personal_owner_user_id) WHERE kind = 'personal' DO NOTHING;

        SELECT id INTO personal_space_id FROM spaces
        WHERE kind = 'personal' AND personal_owner_user_id = target_user_id;

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
      CREATE FUNCTION ensure_legacy_personal_space()
      RETURNS TRIGGER LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.space_id IS NULL THEN
          NEW.space_id := ensure_personal_space_for_user(NEW.user_id);
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE FUNCTION ensure_legacy_transaction_attribution()
      RETURNS TRIGGER LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.added_by_user_id IS NULL THEN
          NEW.added_by_user_id := NEW.user_id;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE FUNCTION ensure_legacy_import_attribution()
      RETURNS TRIGGER LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.imported_by_user_id IS NULL THEN
          NEW.imported_by_user_id := NEW.user_id;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    for (const table of financialTables) {
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
  }
}
