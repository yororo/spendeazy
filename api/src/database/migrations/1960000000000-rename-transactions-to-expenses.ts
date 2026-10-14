import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the active expense schema from transaction names to expense names
 * without changing row identity or values. Activity snapshots keep their
 * stored keys. Historical migration files stay unchanged.
 *
 * The application that reads `expenses` must be deployed with this migration.
 * Rollback runs this migration's down() and then restores the previous
 * application version. Mixed old and new application versions are unsupported.
 */
export class RenameTransactionsToExpenses1960000000000 implements MigrationInterface {
  name = 'RenameTransactionsToExpenses1960000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await renameExpenseSchema(queryRunner, FORWARD_RENAMES);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await renameExpenseSchema(queryRunner, REVERSE_RENAMES);
  }
}

interface SchemaRename {
  readonly fromTable: string;
  readonly toTable: string;
  readonly fromSequence: string;
  readonly toSequence: string;
  readonly fromColumn?: readonly [string, string];
  readonly constraints: readonly (readonly [string, string])[];
  readonly indexes: readonly (readonly [string, string])[];
  readonly fromTrigger: string;
  readonly toTrigger: string;
}

const EXPENSE_RENAMES: SchemaRename = {
  fromTable: 'transactions',
  toTable: 'expenses',
  fromSequence: 'transactions_id_seq',
  toSequence: 'expenses_id_seq',
  constraints: [
    ['pk_transactions', 'pk_expenses'],
    ['fk_transactions_space', 'fk_expenses_space'],
    ['fk_transactions_added_by_user', 'fk_expenses_added_by_user'],
    ['fk_transactions_category_space', 'fk_expenses_category_space'],
    [
      'fk_transactions_statement_import_space',
      'fk_expenses_statement_import_space',
    ],
    ['ck_transactions_amount_positive', 'ck_expenses_amount_positive'],
    ['ck_transactions_confidence_range', 'ck_expenses_confidence_range'],
    [
      'ck_transactions_import_fingerprint_lowercase_sha256',
      'ck_expenses_import_fingerprint_lowercase_sha256',
    ],
    [
      'ck_transactions_reference_hash_lowercase_hmac',
      'ck_expenses_reference_hash_lowercase_hmac',
    ],
  ],
  indexes: [
    ['ix_transactions_statement_import', 'ix_expenses_statement_import'],
    ['ix_transactions_space_purchase_date', 'ix_expenses_space_purchase_date'],
    [
      'ix_transactions_space_category_purchase_date',
      'ix_expenses_space_category_purchase_date',
    ],
    ['ix_transactions_added_by_user', 'ix_expenses_added_by_user'],
    [
      'ix_transactions_space_import_fingerprint',
      'ix_expenses_space_import_fingerprint',
    ],
    [
      'ix_transactions_space_deleted_purchase_date',
      'ix_expenses_space_deleted_purchase_date',
    ],
    [
      'ix_transactions_statement_import_space',
      'ix_expenses_statement_import_space',
    ],
    [
      'ix_transactions_space_reference_hash',
      'ix_expenses_space_reference_hash',
    ],
  ],
  fromTrigger: 'transactions_reject_archived_space_write',
  toTrigger: 'expenses_reject_archived_space_write',
};

const ACTIVITY_RENAMES: SchemaRename = {
  fromTable: 'transaction_activities',
  toTable: 'expense_activities',
  fromSequence: 'transaction_activities_id_seq',
  toSequence: 'expense_activities_id_seq',
  fromColumn: ['transaction_id', 'expense_id'],
  constraints: [
    ['pk_transaction_activities', 'pk_expense_activities'],
    ['fk_transaction_activities_space', 'fk_expense_activities_space'],
    [
      'fk_transaction_activities_actor_user',
      'fk_expense_activities_actor_user',
    ],
    ['ck_transaction_activities_type', 'ck_expense_activities_type'],
    ['ck_transaction_activities_state', 'ck_expense_activities_state'],
  ],
  indexes: [
    [
      'ix_transaction_activities_space_transaction_occurred_at',
      'ix_expense_activities_space_expense_occurred_at',
    ],
    ['ux_transaction_activities_created', 'ux_expense_activities_created'],
  ],
  fromTrigger: 'transaction_activities_reject_archived_space_write',
  toTrigger: 'expense_activities_reject_archived_space_write',
};

const FORWARD_RENAMES = [EXPENSE_RENAMES, ACTIVITY_RENAMES];
const REVERSE_RENAMES = [ACTIVITY_RENAMES, EXPENSE_RENAMES].map(reverseRename);

function reverseRename(rename: SchemaRename): SchemaRename {
  return {
    fromTable: rename.toTable,
    toTable: rename.fromTable,
    fromSequence: rename.toSequence,
    toSequence: rename.fromSequence,
    fromColumn: rename.fromColumn
      ? [rename.fromColumn[1], rename.fromColumn[0]]
      : undefined,
    constraints: rename.constraints.map(([from, to]) => [to, from]),
    indexes: rename.indexes.map(([from, to]) => [to, from]),
    fromTrigger: rename.toTrigger,
    toTrigger: rename.fromTrigger,
  };
}

async function renameExpenseSchema(
  queryRunner: QueryRunner,
  renames: readonly SchemaRename[],
): Promise<void> {
  for (const rename of renames) {
    await queryRunner.query(
      `ALTER TABLE ${rename.fromTable} RENAME TO ${rename.toTable}`,
    );
    if (rename.fromColumn) {
      await queryRunner.query(
        `ALTER TABLE ${rename.toTable} RENAME COLUMN ${rename.fromColumn[0]} TO ${rename.fromColumn[1]}`,
      );
    }
    await queryRunner.query(
      `ALTER SEQUENCE ${rename.fromSequence} RENAME TO ${rename.toSequence}`,
    );
    for (const [from, to] of rename.constraints) {
      await queryRunner.query(
        `ALTER TABLE ${rename.toTable} RENAME CONSTRAINT ${from} TO ${to}`,
      );
    }
    for (const [from, to] of rename.indexes) {
      await queryRunner.query(`ALTER INDEX ${from} RENAME TO ${to}`);
    }
    await queryRunner.query(
      `ALTER TRIGGER ${rename.fromTrigger} ON ${rename.toTable} RENAME TO ${rename.toTrigger}`,
    );
  }
}
