import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl =
  process.env.TEST_TRANSACTION_STATEMENT_IMPORT_SPACE_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Transaction-to-Statement Import Space integrity with PostgreSQL',
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

    async function rows<T>(
      sql: string,
      parameters: unknown[] = [],
    ): Promise<T[]> {
      const result: unknown = await database.query(sql, parameters);
      if (!Array.isArray(result)) throw new Error('Expected PostgreSQL rows');
      return result as T[];
    }

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

      await database.getRepository(TransactionEntity).delete({
        spaceId: firstSpaceId,
      });
      await database.getRepository(TransactionEntity).delete({
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

    it('persists same-Space imported Transactions and manual Transactions without provenance', async () => {
      const imported = await database.getRepository(TransactionEntity).save({
        spaceId: firstSpaceId,
        addedByUserId: firstUserId,
        categoryId: null,
        statementImportId: firstImportId,
        purchaseDate: '2026-09-02',
        description: 'Same-Space imported transaction',
        amount: '12.34',
        categoryMatchConfidence: null,
        importFingerprint: 'c'.repeat(64),
        deletedAt: null,
      });
      const manual = await database.getRepository(TransactionEntity).save({
        spaceId: firstSpaceId,
        addedByUserId: firstUserId,
        categoryId: null,
        statementImportId: null,
        purchaseDate: '2026-09-03',
        description: 'Manual transaction',
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
      const transactionRepository = database.getRepository(TransactionEntity);

      await expect(
        transactionRepository.save({
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
          constraint: 'fk_transactions_statement_import_space',
        },
      });

      await expect(
        transactionRepository.save({
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
          constraint: 'fk_transactions_statement_import_space',
        },
      });
    });

    it('fails the migration before adding the constraint and reports a repairable example', async () => {
      if (firstUserId === undefined || firstSpaceId === undefined) {
        throw new Error('The migration fixture was not created');
      }

      await database.undoLastMigration();
      const [invalid] = await rows<{ id: string }>(
        `INSERT INTO transactions
           (space_id, added_by_user_id, statement_import_id, purchase_date, description, amount, import_fingerprint)
         VALUES ($1, $2, $3, '2026-09-06', 'Invalid historical provenance', '3.00', $4)
         RETURNING id`,
        [secondSpaceId, firstUserId, firstImportId, 'f'.repeat(64)],
      );

      await expect(database.runMigrations()).rejects.toThrow(
        /Cannot enforce Transaction-to-Statement Import Space integrity.*transaction/i,
      );

      const constraints = await rows<{ constraint_name: string }>(
        `SELECT constraint_name
           FROM information_schema.table_constraints
          WHERE table_name = 'transactions'
            AND constraint_name = 'fk_transactions_statement_import_space'`,
      );
      expect(constraints).toEqual([]);

      await database.query('DELETE FROM transactions WHERE id = $1', [
        invalid.id,
      ]);
      await expect(database.runMigrations()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'EnforceTransactionStatementImportSpace1880000000000',
          }),
        ]),
      );
    });
  },
);
