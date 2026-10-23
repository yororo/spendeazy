import { DataSource } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { ExpenseEntity } from '../src/database/entities/expense.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl = process.env.TEST_EXPENSE_RENAME_MIGRATION_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const fingerprint = 'ab'.repeat(32);
const otherFingerprint = 'cd'.repeat(32);
const referenceHash = 'ef'.repeat(32);
const fileHash = '12'.repeat(32);
const snapshot = {
  categoryId: null,
  purchaseDate: '2026-03-02',
  description: 'Imported groceries',
  amount: '8.50',
};

describeDatabase('expense rename migration with PostgreSQL', () => {
  let database: DataSource;

  async function rows<T>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    const result: unknown = await database.query(sql, parameters);
    if (!Array.isArray(result)) throw new Error('Expected PostgreSQL rows');
    return result as T[];
  }

  async function connect(
    migrations: readonly (typeof DATABASE_MIGRATIONS)[number][],
  ) {
    if (database?.isInitialized) await database.destroy();
    database = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: DATABASE_ENTITIES,
      migrations: [...migrations],
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
    }).initialize();
  }

  beforeAll(async () => {
    await connect([]);
    const existingTables = await rows<{ users: string | null }>(
      "SELECT to_regclass('public.users') AS users",
    );
    if (existingTables[0]?.users !== null) {
      throw new Error('Migration check requires an empty disposable database');
    }
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('preserves populated spending through the forward and reverse rename', async () => {
    await connect(DATABASE_MIGRATIONS.slice(0, -1));
    await database.runMigrations();

    const users = await database.getRepository(UserEntity).save([
      {
        clerkUserId: 'rename-owner',
        name: 'Rename Owner',
        email: 'rename-owner@example.test',
      },
      {
        clerkUserId: 'rename-peer',
        name: 'Rename Peer',
        email: 'rename-peer@example.test',
      },
    ]);
    const spaces = new TypeOrmSpaceStore(database.manager);
    const personalSpaceId = await spaces.ensurePersonalSpace(users[0].id);
    const [sharedSpace] = await rows<{ id: string }>(
      `INSERT INTO spaces (kind, status) VALUES ('shared', 'active') RETURNING id`,
    );
    await database.query(
      `INSERT INTO space_memberships (space_id, user_id, access_level)
       VALUES ($1, $2, 'write'), ($1, $3, 'write')`,
      [sharedSpace.id, users[0].id, users[1].id],
    );
    const category = await database.getRepository(CategoryEntity).save({
      spaceId: personalSpaceId,
      name: 'Groceries',
      description: null,
      color: 'teal',
      isActive: true,
    });
    const statementImport = await database
      .getRepository(StatementImportEntity)
      .save({
        spaceId: personalSpaceId,
        importedByUserId: users[0].id,
        fileName: 'march.pdf',
        fileHash,
        statementDate: '2026-03-31',
        bank: 'GCash',
        cardType: 'e-wallet',
        statementType: 'e_wallet',
        transactionHistoryStartDate: '2026-03-01',
        totalDebit: '20.00',
      });
    const [manual] = await rows<{ id: string }>(
      `INSERT INTO transactions
         (space_id, added_by_user_id, category_id, purchase_date, description, amount)
       VALUES ($1, $2, $3, '2026-03-04', 'Cash groceries', '15.25')
       RETURNING id`,
      [personalSpaceId, users[0].id, category.id],
    );
    const [imported] = await rows<{ id: string }>(
      `INSERT INTO transactions
         (space_id, added_by_user_id, category_id, statement_import_id, purchase_date, description, amount, import_fingerprint, reference_hash)
       VALUES ($1, $2, $3, $4, '2026-03-02', 'Imported groceries', '8.50', $5, $6)
       RETURNING id`,
      [
        personalSpaceId,
        users[0].id,
        category.id,
        statementImport.id,
        fingerprint,
        referenceHash,
      ],
    );
    const [deleted] = await rows<{ id: string }>(
      `INSERT INTO transactions
         (space_id, added_by_user_id, statement_import_id, purchase_date, description, amount, import_fingerprint, deleted_at)
       VALUES ($1, $2, $3, '2026-03-03', 'Deleted duplicate', '8.50', $4, '2026-03-05T00:00:00.000Z')
       RETURNING id`,
      [personalSpaceId, users[0].id, statementImport.id, fingerprint],
    );
    const [sharedExpense] = await rows<{ id: string }>(
      `INSERT INTO transactions
         (space_id, added_by_user_id, purchase_date, description, amount, import_fingerprint)
       VALUES ($1, $2, '2026-03-06', 'Shared fingerprint', '4.00', $3)
       RETURNING id`,
      [sharedSpace.id, users[1].id, otherFingerprint],
    );
    await database.query(
      `INSERT INTO transaction_activities
         (transaction_id, space_id, actor_user_id, activity_type, occurred_at)
       VALUES ($1, $2, $3, 'created', '2026-03-04T01:00:00.000Z')`,
      [manual.id, personalSpaceId, users[0].id],
    );
    await database.query(
      `INSERT INTO transaction_activities
         (transaction_id, space_id, actor_user_id, activity_type, occurred_at, before_state, after_state)
       VALUES ($1, $2, $3, 'edited', '2026-03-04T02:00:00.000Z', $4::jsonb, $5::jsonb)`,
      [
        imported.id,
        personalSpaceId,
        users[0].id,
        JSON.stringify({ ...snapshot, amount: '7.50' }),
        JSON.stringify(snapshot),
      ],
    );
    await database.query(
      `INSERT INTO transaction_activities
         (transaction_id, space_id, actor_user_id, activity_type, occurred_at)
       VALUES ($1, $2, $3, 'deleted', '2026-03-05T00:00:00.000Z')`,
      [deleted.id, personalSpaceId, users[1].id],
    );

    await connect(DATABASE_MIGRATIONS);
    await database.runMigrations();
    await expectPreservedExpenseSchema({
      manualId: manual.id,
      importedId: imported.id,
      deletedId: deleted.id,
      sharedExpenseId: sharedExpense.id,
      personalSpaceId,
      sharedSpaceId: sharedSpace.id,
      categoryId: category.id,
      statementImportId: statementImport.id,
      actorUserId: users[0].id,
      deletingActorId: users[1].id,
    });
    await database.undoLastMigration();
    const [latestMigration] = await rows<{ name: string }>(
      'SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1',
    );
    expect(latestMigration).toEqual({
      name: 'ClassifyStatementImports1950000000000',
    });
    await expectPreservedTransactionSchema(manual.id, imported.id);
    await database.runMigrations();
    await expectPreservedExpenseSchema({
      manualId: manual.id,
      importedId: imported.id,
      deletedId: deleted.id,
      sharedExpenseId: sharedExpense.id,
      personalSpaceId,
      sharedSpaceId: sharedSpace.id,
      categoryId: category.id,
      statementImportId: statementImport.id,
      actorUserId: users[0].id,
      deletingActorId: users[1].id,
    });
  });

  it('installs the renamed schema from an empty database', async () => {
    if (database?.isInitialized) await database.destroy();
    await databaseQuery(
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    );
    await connect(DATABASE_MIGRATIONS);
    await database.runMigrations();

    const [user] = await database.getRepository(UserEntity).save([
      {
        clerkUserId: 'fresh-owner',
        name: 'Fresh Owner',
        email: 'fresh-owner@example.test',
      },
    ]);
    const personalSpaceId = await new TypeOrmSpaceStore(
      database.manager,
    ).ensurePersonalSpace(user.id);
    const saved = await database.getRepository(ExpenseEntity).save({
      spaceId: personalSpaceId,
      addedByUserId: user.id,
      categoryId: null,
      statementImportId: null,
      purchaseDate: '2026-04-01',
      description: 'Fresh manual expense',
      amount: '6.00',
      categoryMatchConfidence: null,
      importFingerprint: null,
      referenceHash: null,
      deletedAt: null,
    });
    expect(saved.id).toMatch(/^[1-9]\d*$/);

    await expect(
      database.query(
        `INSERT INTO expenses (space_id, added_by_user_id, purchase_date, description, amount)
         VALUES ($1, $2, '2026-04-02', 'Zero', '0.00')`,
        [personalSpaceId, user.id],
      ),
    ).rejects.toMatchObject({
      driverError: { constraint: 'ck_expenses_amount_positive' },
    });
    const relations = await rows<{
      expenses: string | null;
      transactions: string | null;
    }>(
      `SELECT to_regclass('public.expenses')::text AS expenses,
              to_regclass('public.transactions')::text AS transactions`,
    );
    expect(relations[0]).toEqual({
      expenses: 'expenses',
      transactions: null,
    });
  });

  async function expectPreservedExpenseSchema(expected: {
    manualId: string;
    importedId: string;
    deletedId: string;
    sharedExpenseId: string;
    personalSpaceId: string;
    sharedSpaceId: string;
    categoryId: string;
    statementImportId: string;
    actorUserId: string;
    deletingActorId: string;
  }) {
    const saved = await rows<{
      id: string;
      space_id: string;
      added_by_user_id: string;
      category_id: string | null;
      statement_import_id: string | null;
      purchase_date: string;
      description: string;
      amount: string;
      import_fingerprint: string | null;
      reference_hash: string | null;
      deleted_at: Date | null;
    }>(
      `SELECT id, space_id, added_by_user_id, category_id, statement_import_id,
              purchase_date::text, description, amount::text,
              import_fingerprint, reference_hash, deleted_at
         FROM expenses
        ORDER BY id`,
    );
    expect(saved).toEqual([
      {
        id: expected.manualId,
        space_id: expected.personalSpaceId,
        added_by_user_id: expected.actorUserId,
        category_id: expected.categoryId,
        statement_import_id: null,
        purchase_date: '2026-03-04',
        description: 'Cash groceries',
        amount: '15.25',
        import_fingerprint: null,
        reference_hash: null,
        deleted_at: null,
      },
      {
        id: expected.importedId,
        space_id: expected.personalSpaceId,
        added_by_user_id: expected.actorUserId,
        category_id: expected.categoryId,
        statement_import_id: expected.statementImportId,
        purchase_date: '2026-03-02',
        description: 'Imported groceries',
        amount: '8.50',
        import_fingerprint: fingerprint,
        reference_hash: referenceHash,
        deleted_at: null,
      },
      expect.objectContaining({
        id: expected.deletedId,
        space_id: expected.personalSpaceId,
        description: 'Deleted duplicate',
        amount: '8.50',
        import_fingerprint: fingerprint,
      }),
      {
        id: expected.sharedExpenseId,
        space_id: expected.sharedSpaceId,
        added_by_user_id: expected.deletingActorId,
        category_id: null,
        statement_import_id: null,
        purchase_date: '2026-03-06',
        description: 'Shared fingerprint',
        amount: '4.00',
        import_fingerprint: otherFingerprint,
        reference_hash: null,
        deleted_at: null,
      },
    ]);
    expect(saved[2]?.deleted_at).toEqual(new Date('2026-03-05T00:00:00.000Z'));

    const [provenance] = await rows<{
      file_hash: string;
      transaction_history_start_date: string;
    }>(
      `SELECT file_hash, transaction_history_start_date::text
         FROM statement_imports
        WHERE id = $1`,
      [expected.statementImportId],
    );
    expect(provenance).toEqual({
      file_hash: fileHash,
      transaction_history_start_date: '2026-03-01',
    });

    const fingerprints = await rows<{ space_id: string; matches: string }>(
      `SELECT space_id, COUNT(*)::text AS matches
         FROM expenses
        WHERE import_fingerprint = $1
        GROUP BY space_id`,
      [fingerprint],
    );
    expect(fingerprints).toEqual([
      { space_id: expected.personalSpaceId, matches: '2' },
    ]);

    const [activity] = await rows<{
      expense_id: string;
      activity_type: string;
      before_state: unknown;
      after_state: typeof snapshot;
    }>(
      `SELECT expense_id, activity_type, before_state, after_state
         FROM expense_activities
        WHERE activity_type = 'edited'`,
    );
    expect(activity).toMatchObject({
      expense_id: expected.importedId,
      activity_type: 'edited',
      after_state: snapshot,
    });
    expect(activity.before_state).toEqual({ ...snapshot, amount: '7.50' });

    await expect(
      database.query(
        `INSERT INTO expenses (space_id, added_by_user_id, purchase_date, description, amount)
         VALUES ($1, $2, '2026-03-07', 'Negative', '-1.00')`,
        [expected.personalSpaceId, expected.actorUserId],
      ),
    ).rejects.toMatchObject({
      driverError: { constraint: 'ck_expenses_amount_positive' },
    });
    await expect(
      database.query(
        `INSERT INTO expenses
           (space_id, added_by_user_id, category_id, purchase_date, description, amount)
         VALUES ($1, $2, $3, '2026-03-08', 'Cross-Space category', '1.00')`,
        [expected.sharedSpaceId, expected.deletingActorId, expected.categoryId],
      ),
    ).rejects.toMatchObject({
      driverError: { constraint: 'fk_expenses_category_space' },
    });
  }

  async function expectPreservedTransactionSchema(
    manualId: string,
    importedId: string,
  ) {
    const names = await rows<{
      expenses: string | null;
      transactions: string | null;
    }>(
      `SELECT to_regclass('public.expenses')::text AS expenses,
              to_regclass('public.transactions')::text AS transactions`,
    );
    expect(names[0]).toEqual({ expenses: null, transactions: 'transactions' });
    const [manual] = await rows<{ description: string; amount: string }>(
      `SELECT description, amount::text AS amount FROM transactions WHERE id = $1`,
      [manualId],
    );
    expect(manual).toEqual({ description: 'Cash groceries', amount: '15.25' });
    const [activity] = await rows<{
      transaction_id: string;
      after_state: typeof snapshot;
    }>(
      `SELECT transaction_id, after_state
         FROM transaction_activities
        WHERE activity_type = 'edited'`,
    );
    expect(activity).toEqual({
      transaction_id: importedId,
      after_state: snapshot,
    });
  }
});

async function databaseQuery(sql: string): Promise<void> {
  const connection = await new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
  }).initialize();
  try {
    await connection.query(sql);
  } finally {
    await connection.destroy();
  }
}
