import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { ExpenseEntity } from '../src/database/entities/expense.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl =
  process.env.TEST_EXPENSE_STATEMENT_IMPORT_SPACE_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Expense-to-Statement Import Space integrity with PostgreSQL',
  () => {
    let database: DataSource;
    let firstUserId: string | undefined;
    let secondUserId: string | undefined;
    let firstSpaceId: string | undefined;
    let secondSpaceId: string | undefined;
    let firstImportId: string | undefined;

    beforeAll(async () => {
      database = await new DataSource({
        type: 'postgres',
        url: databaseUrl,
        entities: DATABASE_ENTITIES,
        migrations: DATABASE_MIGRATIONS,
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
      }).initialize();
      await database.runMigrations();
    });

    beforeEach(async () => {
      const suffix = randomUUID();
      const users = await database.getRepository(UserEntity).save([
        {
          clerkUserId: `${suffix}-first`,
          name: 'First integrity test User',
          email: `${suffix}-first@example.test`,
        },
        {
          clerkUserId: `${suffix}-second`,
          name: 'Second integrity test User',
          email: `${suffix}-second@example.test`,
        },
      ]);
      firstUserId = users[0].id;
      secondUserId = users[1].id;

      const spaces = new TypeOrmSpaceStore(database.manager);
      firstSpaceId = await spaces.ensurePersonalSpace(firstUserId);
      secondSpaceId = await spaces.ensurePersonalSpace(secondUserId);

      const imports = await database.getRepository(StatementImportEntity).save([
        {
          spaceId: firstSpaceId,
          importedByUserId: firstUserId,
          fileName: 'first.pdf',
          fileHash: 'a'.repeat(64),
          statementDate: '2026-09-01',
          bank: 'First Bank',
          cardType: 'visa',
        },
        {
          spaceId: secondSpaceId,
          importedByUserId: secondUserId,
          fileName: 'second.pdf',
          fileHash: 'b'.repeat(64),
          statementDate: '2026-09-01',
          bank: 'Second Bank',
          cardType: 'visa',
        },
      ]);
      firstImportId = imports[0].id;
    });

    afterEach(async () => {
      if (
        !database?.isInitialized ||
        firstUserId === undefined ||
        secondUserId === undefined ||
        firstSpaceId === undefined ||
        secondSpaceId === undefined
      ) {
        return;
      }

      await database.getRepository(ExpenseEntity).delete({
        spaceId: firstSpaceId,
      });
      await database.getRepository(ExpenseEntity).delete({
        spaceId: secondSpaceId,
      });
      await database.getRepository(StatementImportEntity).delete({
        spaceId: firstSpaceId,
      });
      await database.getRepository(StatementImportEntity).delete({
        spaceId: secondSpaceId,
      });
      await database.getRepository(UserEntity).delete({ id: firstUserId });
      await database.getRepository(UserEntity).delete({ id: secondUserId });

      firstUserId = undefined;
      secondUserId = undefined;
      firstSpaceId = undefined;
      secondSpaceId = undefined;
      firstImportId = undefined;
    });

    afterAll(async () => {
      if (database?.isInitialized) {
        await database.destroy();
      }
    });

    it('persists same-Space imported Expenses and manual Expenses without provenance', async () => {
      const imported = await database.getRepository(ExpenseEntity).save({
        spaceId: firstSpaceId,
        addedByUserId: firstUserId,
        categoryId: null,
        statementImportId: firstImportId,
        purchaseDate: '2026-09-02',
        description: 'Same-Space imported expense',
        amount: '12.34',
        categoryMatchConfidence: null,
        importFingerprint: 'c'.repeat(64),
        deletedAt: null,
      });
      const manual = await database.getRepository(ExpenseEntity).save({
        spaceId: firstSpaceId,
        addedByUserId: firstUserId,
        categoryId: null,
        statementImportId: null,
        purchaseDate: '2026-09-03',
        description: 'Manual expense',
        amount: '5.67',
        categoryMatchConfidence: null,
        importFingerprint: null,
        deletedAt: null,
      });

      expect(imported).toMatchObject({
        spaceId: firstSpaceId,
        statementImportId: firstImportId,
      });
      expect(manual).toMatchObject({
        spaceId: firstSpaceId,
        statementImportId: null,
      });
    });

    it('rejects cross-Space and missing Statement Import provenance', async () => {
      const expenseRepository = database.getRepository(ExpenseEntity);

      await expect(
        expenseRepository.save({
          spaceId: secondSpaceId,
          addedByUserId: secondUserId,
          categoryId: null,
          statementImportId: firstImportId,
          purchaseDate: '2026-09-04',
          description: 'Cross-Space provenance',
          amount: '1.00',
          categoryMatchConfidence: null,
          importFingerprint: 'd'.repeat(64),
          deletedAt: null,
        }),
      ).rejects.toMatchObject({
        driverError: {
          code: '23503',
          constraint: 'fk_expenses_statement_import_space',
        },
      });

      await expect(
        expenseRepository.save({
          spaceId: firstSpaceId,
          addedByUserId: firstUserId,
          categoryId: null,
          statementImportId: '999999999',
          purchaseDate: '2026-09-05',
          description: 'Missing provenance',
          amount: '2.00',
          categoryMatchConfidence: null,
          importFingerprint: 'e'.repeat(64),
          deletedAt: null,
        }),
      ).rejects.toMatchObject({
        driverError: {
          code: '23503',
          constraint: 'fk_expenses_statement_import_space',
        },
      });
    });
  },
);

describeDatabase(
  'historical Expense provenance migration guard with PostgreSQL',
  () => {
    const migrationsBeforeGuard = DATABASE_MIGRATIONS.slice(
      0,
      DATABASE_MIGRATIONS.findIndex(
        (migration) =>
          migration.name ===
          'EnforceTransactionStatementImportSpace1880000000000',
      ),
    );

    async function rows<T>(
      active: DataSource,
      sql: string,
      parameters: unknown[] = [],
    ): Promise<T[]> {
      const result: unknown = await active.query(sql, parameters);
      if (!Array.isArray(result)) throw new Error('Expected PostgreSQL rows');
      return result as T[];
    }

    it('fails migration 188 before its index when provenance crosses Spaces, then finishes the rename', async () => {
      await databaseQuery(
        `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`,
      );

      let database = await new DataSource({
        type: 'postgres',
        url: databaseUrl,
        entities: DATABASE_ENTITIES,
        migrations: migrationsBeforeGuard,
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
      }).initialize();

      try {
        await database.runMigrations();
        const suffix = randomUUID();
        const users = await database.getRepository(UserEntity).save([
          {
            clerkUserId: `${suffix}-first`,
            name: 'Guard first User',
            email: `${suffix}-first@example.test`,
          },
          {
            clerkUserId: `${suffix}-second`,
            name: 'Guard second User',
            email: `${suffix}-second@example.test`,
          },
        ]);
        const spaces = new TypeOrmSpaceStore(database.manager);
        const firstSpaceId = await spaces.ensurePersonalSpace(users[0].id);
        const secondSpaceId = await spaces.ensurePersonalSpace(users[1].id);
        const [statementImport] = await rows<{ id: string }>(
          database,
          `INSERT INTO statement_imports
             (space_id, imported_by_user_id, file_name, file_hash, statement_date, bank, card_type)
           VALUES ($1, $2, 'guard.pdf', $3, '2026-09-01', 'Guard Bank', 'visa')
           RETURNING id`,
          [firstSpaceId, users[0].id, 'a'.repeat(64)],
        );
        const [valid] = await rows<{ id: string }>(
          database,
          `INSERT INTO transactions
             (space_id, added_by_user_id, statement_import_id, purchase_date, description, amount, import_fingerprint)
           VALUES ($1, $2, $3, '2026-09-02', 'Same-Space historical expense', '4.00', $4)
           RETURNING id`,
          [firstSpaceId, users[0].id, statementImport.id, 'c'.repeat(64)],
        );
        await database.query(
          'ALTER TABLE transactions DROP CONSTRAINT fk_transactions_statement_import_space',
        );
        const [invalid] = await rows<{ id: string }>(
          database,
          `INSERT INTO transactions
             (space_id, added_by_user_id, statement_import_id, purchase_date, description, amount, import_fingerprint)
           VALUES ($1, $2, $3, '2026-09-06', 'Invalid historical provenance', '3.00', $4)
           RETURNING id`,
          [secondSpaceId, users[1].id, statementImport.id, 'f'.repeat(64)],
        );

        await database.destroy();
        database = await new DataSource({
          type: 'postgres',
          url: databaseUrl,
          entities: DATABASE_ENTITIES,
          migrations: DATABASE_MIGRATIONS,
          migrationsTableName: 'typeorm_migrations',
          synchronize: false,
        }).initialize();

        await expect(database.runMigrations()).rejects.toThrow(
          /Cannot enforce Transaction-to-Statement Import Space integrity.*transaction/i,
        );
        const indexes = await rows<{ indexname: string }>(
          database,
          `SELECT indexname FROM pg_indexes WHERE indexname = 'ix_transactions_statement_import_space'`,
        );
        expect(indexes).toEqual([]);

        await database.query('DELETE FROM transactions WHERE id = $1', [
          invalid.id,
        ]);
        await database.query(`
          ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_statement_import_space
            FOREIGN KEY (statement_import_id, space_id)
            REFERENCES statement_imports (id, space_id)
            ON DELETE RESTRICT
        `);
        await expect(database.runMigrations()).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'EnforceTransactionStatementImportSpace1880000000000',
            }),
            expect.objectContaining({
              name: 'RenameTransactionsToExpenses1960000000000',
            }),
          ]),
        );

        const [saved] = await rows<{
          id: string;
          description: string;
          amount: string;
          import_fingerprint: string;
        }>(
          database,
          `SELECT id, description, amount, import_fingerprint
             FROM expenses
            WHERE id = $1`,
          [valid.id],
        );
        expect(saved).toEqual({
          id: valid.id,
          description: 'Same-Space historical expense',
          amount: '4.00',
          import_fingerprint: 'c'.repeat(64),
        });
        const renamed = await rows<{ name: string | null }>(
          database,
          `SELECT to_regclass('public.transactions')::text AS name`,
        );
        expect(renamed[0]?.name).toBeNull();
      } finally {
        if (database.isInitialized) await database.destroy();
      }
    });
  },
);

async function databaseQuery(sql: string): Promise<void> {
  const database = await new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
  }).initialize();
  try {
    await database.query(sql);
  } finally {
    await database.destroy();
  }
}
