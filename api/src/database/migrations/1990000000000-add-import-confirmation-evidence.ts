import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImportConfirmationEvidence1990000000000 implements MigrationInterface {
  name = 'AddImportConfirmationEvidence1990000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE statement_imports
        ADD COLUMN confirmation_evidence JSONB,
        ADD COLUMN included_count BIGINT,
        ADD COLUMN excluded_count BIGINT,
        ADD COLUMN original_expense_count BIGINT,
        ADD COLUMN original_expense_total NUMERIC,
        ADD COLUMN acknowledged_warnings JSONB,
        ADD COLUMN acknowledged_warning_digest CHAR(64),
        ADD CONSTRAINT uq_statement_imports_actor UNIQUE (id, space_id, imported_by_user_id),
        ADD CONSTRAINT ck_statement_imports_confirmation CHECK (
          (confirmation_evidence IS NULL AND included_count IS NULL AND excluded_count IS NULL
            AND original_expense_count IS NULL AND original_expense_total IS NULL
            AND acknowledged_warnings IS NULL AND acknowledged_warning_digest IS NULL)
          OR (confirmation_evidence IS NOT NULL AND included_count IS NOT NULL AND included_count > 0
            AND excluded_count IS NOT NULL AND excluded_count >= 0
            AND original_expense_count IS NOT NULL AND original_expense_count = included_count
            AND original_expense_total IS NOT NULL AND original_expense_total > 0
            AND original_expense_total = trunc(original_expense_total, 2)
            AND acknowledged_warnings IS NOT NULL AND jsonb_typeof(acknowledged_warnings) = 'array'
            AND (acknowledged_warning_digest IS NULL OR acknowledged_warning_digest ~ '^[0-9a-f]{64}$'))
        );

      CREATE TABLE statement_import_rows (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        statement_import_id BIGINT NOT NULL,
        space_id BIGINT NOT NULL,
        source_row_id VARCHAR(100) NOT NULL CHECK (btrim(source_row_id) <> ''),
        disposition VARCHAR(10) NOT NULL CHECK (disposition IN ('included', 'excluded')),
        original_evidence JSONB NOT NULL,
        confirmed_values JSONB,
        confirmed_category_id BIGINT GENERATED ALWAYS AS ((confirmed_values ->> 'categoryId')::bigint) STORED,
        exclusion JSONB,
        CONSTRAINT uq_statement_import_rows_source UNIQUE (statement_import_id, source_row_id),
        CONSTRAINT uq_statement_import_rows_expense_link UNIQUE (id, statement_import_id, space_id, source_row_id),
        CONSTRAINT fk_statement_import_rows_import FOREIGN KEY (statement_import_id, space_id)
          REFERENCES statement_imports (id, space_id) ON DELETE CASCADE,
        CONSTRAINT fk_statement_import_rows_category FOREIGN KEY (confirmed_category_id, space_id)
          REFERENCES categories (id, space_id) ON DELETE RESTRICT,
        CONSTRAINT ck_statement_import_rows_private CHECK (
          jsonb_typeof(original_evidence) = 'object' AND NOT (original_evidence ? 'duplicateReference')
          AND original_evidence ->> 'sourceRowId' = source_row_id
          AND original_evidence ? 'referenceHash'
          AND (original_evidence ->> 'referenceHash' IS NULL OR original_evidence ->> 'referenceHash' ~ '^[0-9a-f]{64}$')
        ),
        CONSTRAINT ck_statement_import_rows_disposition CHECK (
          (disposition = 'included' AND confirmed_values IS NOT NULL AND exclusion IS NULL)
          OR (disposition = 'excluded' AND confirmed_values IS NULL AND exclusion IS NOT NULL)
        )
      );

      ALTER TABLE expenses ADD COLUMN statement_import_row_id BIGINT,
        ADD CONSTRAINT ck_expenses_snapshot_requires_provenance CHECK (
          statement_import_row_id IS NULL OR (statement_import_id IS NOT NULL AND source_row_id IS NOT NULL)
        ),
        ADD CONSTRAINT fk_expenses_import_snapshot FOREIGN KEY
          (statement_import_row_id, statement_import_id, space_id, source_row_id)
          REFERENCES statement_import_rows (id, statement_import_id, space_id, source_row_id) ON DELETE RESTRICT;

      CREATE TABLE statement_import_operations (
        actor_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        space_id BIGINT NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
        operation_id UUID NOT NULL,
        request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        statement_import_id BIGINT,
        success_result JSONB,
        failure JSONB,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_statement_import_operations PRIMARY KEY (actor_user_id, space_id, operation_id),
        CONSTRAINT fk_statement_import_operations_import FOREIGN KEY (statement_import_id, space_id, actor_user_id)
          REFERENCES statement_imports (id, space_id, imported_by_user_id) ON DELETE RESTRICT,
        CONSTRAINT ck_statement_import_operations_state CHECK (
          (status = 'pending' AND statement_import_id IS NULL AND success_result IS NULL AND failure IS NULL)
          OR (status = 'committed' AND statement_import_id IS NOT NULL AND success_result IS NOT NULL AND failure IS NULL)
          OR (status = 'not_committed' AND statement_import_id IS NULL AND success_result IS NULL AND failure IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX uq_statement_import_operations_import ON statement_import_operations (statement_import_id)
        WHERE statement_import_id IS NOT NULL;

      CREATE FUNCTION guard_import_provenance() RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION 'Immutable import provenance' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $body$;
      CREATE TRIGGER statement_imports_immutable BEFORE UPDATE OR DELETE ON statement_imports
        FOR EACH ROW EXECUTE FUNCTION guard_import_provenance();
      CREATE TRIGGER statement_import_rows_immutable BEFORE UPDATE OR DELETE ON statement_import_rows
        FOR EACH ROW EXECUTE FUNCTION guard_import_provenance();
      CREATE TRIGGER statement_import_rows_reject_archived_space_write BEFORE INSERT OR UPDATE OR DELETE ON statement_import_rows
        FOR EACH ROW EXECUTE FUNCTION reject_archived_space_write();

      CREATE FUNCTION guard_import_operation() RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id OR NEW.space_id IS DISTINCT FROM OLD.space_id
          OR NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
          OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending' THEN
          RAISE EXCEPTION 'Immutable import operation identity or terminal state' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $body$;
      CREATE TRIGGER statement_import_operations_immutable BEFORE UPDATE ON statement_import_operations
        FOR EACH ROW EXECUTE FUNCTION guard_import_operation();
      CREATE TRIGGER statement_import_operations_reject_archived_space_write BEFORE INSERT ON statement_import_operations
        FOR EACH ROW EXECUTE FUNCTION reject_archived_space_write();

      CREATE FUNCTION guard_expense_import_snapshot() RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_OP = 'UPDATE' AND (NEW.statement_import_row_id IS DISTINCT FROM OLD.statement_import_row_id
          OR NEW.statement_import_id IS DISTINCT FROM OLD.statement_import_id OR NEW.source_row_id IS DISTINCT FROM OLD.source_row_id) THEN
          RAISE EXCEPTION 'Immutable Expense provenance' USING ERRCODE = '23514';
        END IF;
        IF NEW.statement_import_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM statement_imports WHERE id = NEW.statement_import_id AND space_id = NEW.space_id AND confirmation_evidence IS NOT NULL
        ) AND NEW.statement_import_row_id IS NULL THEN
          RAISE EXCEPTION 'Complete imports require a row snapshot' USING ERRCODE = '23514';
        END IF;
        IF NEW.statement_import_row_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM statement_import_rows WHERE id = NEW.statement_import_row_id AND disposition = 'included'
        ) THEN RAISE EXCEPTION 'Expense requires an included snapshot' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END; $body$;
      CREATE TRIGGER expenses_import_snapshot BEFORE INSERT OR UPDATE ON expenses
        FOR EACH ROW EXECUTE FUNCTION guard_expense_import_snapshot();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER expenses_import_snapshot ON expenses;
      DROP FUNCTION guard_expense_import_snapshot();
      DROP TABLE statement_import_operations;
      DROP FUNCTION guard_import_operation();
      ALTER TABLE expenses DROP CONSTRAINT fk_expenses_import_snapshot,
        DROP CONSTRAINT ck_expenses_snapshot_requires_provenance, DROP COLUMN statement_import_row_id;
      DROP TABLE statement_import_rows;
      DROP TRIGGER statement_imports_immutable ON statement_imports;
      DROP FUNCTION guard_import_provenance();
      ALTER TABLE statement_imports DROP CONSTRAINT ck_statement_imports_confirmation,
        DROP CONSTRAINT uq_statement_imports_actor, DROP COLUMN confirmation_evidence,
        DROP COLUMN included_count, DROP COLUMN excluded_count, DROP COLUMN original_expense_count,
        DROP COLUMN original_expense_total, DROP COLUMN acknowledged_warnings, DROP COLUMN acknowledged_warning_digest;
    `);
  }
}
