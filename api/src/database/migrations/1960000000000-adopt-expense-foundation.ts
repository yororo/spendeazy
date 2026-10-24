import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdoptExpenseFoundation1960000000000 implements MigrationInterface {
  name = 'AdoptExpenseFoundation1960000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE transactions RENAME TO expenses`);
    await queryRunner.query(
      `ALTER TABLE expenses RENAME COLUMN purchase_date TO expense_date`,
    );
    await queryRunner.query(
      `ALTER TABLE transaction_activities RENAME TO expense_activities`,
    );
    await queryRunner.query(
      `ALTER TABLE expense_activities RENAME COLUMN transaction_id TO expense_id`,
    );

    await queryRunner.query(`
      DO $$
      DECLARE item RECORD;
      DECLARE renamed TEXT;
      BEGIN
        FOR item IN
          SELECT conname, conrelid::regclass AS relation
            FROM pg_constraint
           WHERE conrelid IN ('expenses'::regclass, 'expense_activities'::regclass)
             AND (conname LIKE '%transactions%' OR conname LIKE '%transaction_activities%')
        LOOP
          renamed := replace(item.conname, 'transaction_activities', 'expense_activities');
          renamed := replace(renamed, 'transactions', 'expenses');
          renamed := replace(renamed, 'purchase_date', 'expense_date');
          EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', item.relation, item.conname, renamed);
        END LOOP;

        FOR item IN
          SELECT index_class.relname AS index_name
            FROM pg_index indexes
            JOIN pg_class index_class ON index_class.oid = indexes.indexrelid
           WHERE indexes.indrelid IN ('expenses'::regclass, 'expense_activities'::regclass)
             AND (index_class.relname LIKE '%transactions%' OR index_class.relname LIKE '%transaction_activities%')
        LOOP
          renamed := replace(item.index_name, 'transaction_activities', 'expense_activities');
          renamed := replace(renamed, 'transactions', 'expenses');
          renamed := replace(renamed, 'purchase_date', 'expense_date');
          EXECUTE format('ALTER INDEX %I RENAME TO %I', item.index_name, renamed);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      ALTER SEQUENCE IF EXISTS transactions_id_seq RENAME TO expenses_id_seq;
      ALTER SEQUENCE IF EXISTS transaction_activities_id_seq RENAME TO expense_activities_id_seq;
    `);

    await queryRunner.query(`
      ALTER TABLE expense_activities
        DROP CONSTRAINT ck_expense_activities_state,
        ADD CONSTRAINT ck_expense_activities_state CHECK (
          (activity_type = 'created' AND before_state IS NULL)
          OR (activity_type = 'edited' AND before_state IS NOT NULL AND after_state IS NOT NULL)
          OR (activity_type = 'deleted' AND after_state IS NULL)
        )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM expenses WHERE category_id IS NULL) THEN
          RAISE EXCEPTION 'Cannot adopt Expense foundation while saved records have no Category; review an explicit same-Space classification first';
        END IF;
      END $$;

      ALTER TABLE expenses
        DROP CONSTRAINT fk_expenses_category_space,
        DROP CONSTRAINT ck_expenses_confidence_range,
        ALTER COLUMN category_id SET NOT NULL,
        DROP COLUMN category_match_confidence,
        ADD COLUMN revision BIGINT NOT NULL DEFAULT 1,
        ADD CONSTRAINT ck_expenses_revision_positive CHECK (revision > 0),
        ADD CONSTRAINT fk_expenses_category_space
          FOREIGN KEY (category_id, space_id)
          REFERENCES categories (id, space_id)
          ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      UPDATE expense_activities
         SET before_state = (before_state - 'purchaseDate') || jsonb_build_object('expenseDate', before_state->'purchaseDate')
       WHERE before_state ? 'purchaseDate';
      UPDATE expense_activities
         SET after_state = (after_state - 'purchaseDate') || jsonb_build_object('expenseDate', after_state->'purchaseDate')
       WHERE after_state ? 'purchaseDate';
    `);

    await queryRunner.query(`
      ALTER TABLE statement_imports
        RENAME COLUMN bank TO provider;
      ALTER TABLE statement_imports
        RENAME COLUMN card_type TO account_format;
      ALTER TABLE statement_imports
        RENAME COLUMN transaction_history_start_date TO history_from_date;
      ALTER TABLE statement_imports
        ADD COLUMN history_to_date DATE;
      UPDATE statement_imports
         SET history_to_date = statement_date,
             statement_date = NULL
       WHERE statement_type = 'e_wallet';
      ALTER TABLE statement_imports
        ALTER COLUMN statement_date DROP NOT NULL,
        DROP CONSTRAINT ck_statement_imports_history_start_before_end,
        ADD CONSTRAINT ck_statement_imports_history_bounds
          CHECK (
            history_from_date IS NULL
            OR history_to_date IS NULL
            OR history_from_date <= history_to_date
          ),
        ADD CONSTRAINT ck_statement_imports_type_dates
          CHECK (
            (statement_type = 'credit_card' AND statement_date IS NOT NULL AND history_from_date IS NULL AND history_to_date IS NULL)
            OR (statement_type = 'e_wallet' AND statement_date IS NULL)
          );
    `);
    await queryRunner.query(`DROP INDEX ux_statement_imports_space_file_hash`);
    await queryRunner.query(
      `CREATE INDEX ix_statement_imports_space_confirmed_at ON statement_imports (space_id, imported_at DESC, id DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expense_activities
        DROP CONSTRAINT ck_expense_activities_state,
        ADD CONSTRAINT ck_expense_activities_state CHECK (
          (activity_type = 'created' AND before_state IS NULL)
          OR (activity_type = 'edited' AND before_state IS NOT NULL AND after_state IS NOT NULL)
          OR (activity_type = 'deleted' AND after_state IS NULL)
        )
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS ix_statement_imports_space_confirmed_at;
      CREATE UNIQUE INDEX ux_statement_imports_space_file_hash ON statement_imports (space_id, file_hash);
      ALTER TABLE statement_imports
        DROP CONSTRAINT ck_statement_imports_type_dates,
        DROP CONSTRAINT ck_statement_imports_history_bounds;
      UPDATE statement_imports
         SET statement_date = history_to_date
       WHERE statement_type = 'e_wallet';
      ALTER TABLE statement_imports
        ALTER COLUMN statement_date SET NOT NULL,
        DROP COLUMN history_to_date,
        RENAME COLUMN history_from_date TO transaction_history_start_date,
        RENAME COLUMN account_format TO card_type,
        RENAME COLUMN provider TO bank,
        ADD CONSTRAINT ck_statement_imports_history_start_before_end
          CHECK (transaction_history_start_date IS NULL OR transaction_history_start_date <= statement_date);
    `);

    await queryRunner.query(`
      UPDATE expense_activities
         SET before_state = (before_state - 'expenseDate') || jsonb_build_object('purchaseDate', before_state->'expenseDate')
       WHERE before_state ? 'expenseDate';
      UPDATE expense_activities
         SET after_state = (after_state - 'expenseDate') || jsonb_build_object('purchaseDate', after_state->'expenseDate')
       WHERE after_state ? 'expenseDate';
    `);
    await queryRunner.query(`
      ALTER TABLE expenses
        DROP CONSTRAINT fk_expenses_category_space,
        DROP CONSTRAINT ck_expenses_revision_positive,
        DROP COLUMN revision,
        ADD COLUMN category_match_confidence NUMERIC(5, 4),
        ALTER COLUMN category_id DROP NOT NULL,
        ADD CONSTRAINT fk_transactions_category_space
          FOREIGN KEY (category_id, space_id)
          REFERENCES categories (id, space_id)
          ON DELETE SET NULL (category_id);
    `);
    await queryRunner.query(
      `ALTER TABLE expense_activities RENAME COLUMN expense_id TO transaction_id`,
    );
    await queryRunner.query(
      `ALTER TABLE expense_activities RENAME TO transaction_activities`,
    );
    await queryRunner.query(
      `ALTER TABLE expenses RENAME COLUMN expense_date TO purchase_date`,
    );
    await queryRunner.query(`ALTER TABLE expenses RENAME TO transactions`);
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS expenses_id_seq RENAME TO transactions_id_seq`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE IF EXISTS expense_activities_id_seq RENAME TO transaction_activities_id_seq`,
    );
    await queryRunner.query(`
      DO $$
      DECLARE item RECORD;
      DECLARE renamed TEXT;
      BEGIN
        FOR item IN
          SELECT conname, conrelid::regclass AS relation
            FROM pg_constraint
           WHERE conrelid IN ('transactions'::regclass, 'transaction_activities'::regclass)
             AND (conname LIKE '%expenses%' OR conname LIKE '%expense_activities%')
        LOOP
          renamed := replace(item.conname, 'expense_activities', 'transaction_activities');
          renamed := replace(renamed, 'expenses', 'transactions');
          renamed := replace(renamed, 'expense_date', 'purchase_date');
          EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', item.relation, item.conname, renamed);
        END LOOP;

        FOR item IN
          SELECT index_class.relname AS index_name
            FROM pg_index indexes
            JOIN pg_class index_class ON index_class.oid = indexes.indexrelid
           WHERE indexes.indrelid IN ('transactions'::regclass, 'transaction_activities'::regclass)
             AND (index_class.relname LIKE '%expenses%' OR index_class.relname LIKE '%expense_activities%')
        LOOP
          renamed := replace(item.index_name, 'expense_activities', 'transaction_activities');
          renamed := replace(renamed, 'expenses', 'transactions');
          renamed := replace(renamed, 'expense_date', 'purchase_date');
          EXECUTE format('ALTER INDEX %I RENAME TO %I', item.index_name, renamed);
        END LOOP;
      END $$;
    `);
  }
}
