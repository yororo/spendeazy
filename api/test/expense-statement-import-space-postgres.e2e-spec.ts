import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, In } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { ExpenseActivityEntity } from '../src/database/entities/expense-activity.entity';
import { ExpenseEntity } from '../src/database/entities/expense.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { StatementImportOperationEntity } from '../src/database/entities/statement-import-operation.entity';
import { StatementImportRowEntity } from '../src/database/entities/statement-import-row.entity';
import { TypeOrmStatementImportStore } from '../src/statement-imports/infrastructure/typeorm-statement-import-store';
import {
  TypeOrmImportOperationStore,
  TypeOrmImportRowStore,
} from '../src/statement-imports/infrastructure/typeorm-import-confirmation-store';
import { validateConfirmationPayload } from '../src/statement-imports/application/validate-confirmation-payload';
import {
  protectConfirmationReferences,
  confirmationRequestHash,
} from '../src/statement-imports/application/confirmation-canonicalization';
import { NodeGCashReferenceHasher } from '../src/statement-imports/infrastructure/node-gcash-reference-hasher';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl =
  process.env.TEST_EXPENSE_STATEMENT_IMPORT_SPACE_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Expense and Statement Import Space integrity with PostgreSQL',
  () => {
    let database: DataSource;
    let users: UserEntity[] = [];
    let spaceIds: string[] = [];

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
      users = await database.getRepository(UserEntity).save([
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
      const spaceStore = new TypeOrmSpaceStore(database.manager);
      spaceIds = await Promise.all(
        users.map((user) => spaceStore.ensurePersonalSpace(user.id)),
      );
    });

    afterEach(async () => {
      if (!database?.isInitialized || users.length === 0) return;
      await database.getRepository(ExpenseActivityEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(ExpenseEntity).delete({
        spaceId: In(spaceIds),
      });
      await database
        .getRepository(StatementImportOperationEntity)
        .delete({ spaceId: In(spaceIds) });
      await database.getRepository(StatementImportEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(CategoryEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(SpaceMembershipEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(SpaceEntity).delete(spaceIds);
      await database
        .getRepository(UserEntity)
        .delete(users.map((user) => user.id));
      users = [];
      spaceIds = [];
    });

    afterAll(async () => {
      if (database?.isInitialized) await database.destroy();
    });

    it('retains complete immutable evidence and operation result through Expense edits/deletion, then cleans Personal relations', async () => {
      const userId = users[0].id;
      const spaceId = spaceIds[0];
      const category = await database
        .getRepository(CategoryEntity)
        .save({ spaceId, name: 'Evidence Category', isActive: true });
      const wire: unknown = JSON.parse(
        readFileSync(
          resolve(
            __dirname,
            '../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
          ),
          'utf8',
        ),
      );
      const payload = validateConfirmationPayload(
        wire,
        new Date('2026-10-30T00:00:00Z'),
      );
      payload.expenses.forEach((row) => {
        row.categoryId = category.id;
      });
      payload.rememberedRules.forEach((rule) => {
        rule.categoryId = category.id;
      });
      const protectedPayload = protectConfirmationReferences(
        payload,
        spaceId,
        new NodeGCashReferenceHasher('fictional-key'),
      );
      const key = { actorUserId: userId, spaceId, operationId: randomUUID() };
      const hash = confirmationRequestHash(spaceId, protectedPayload);
      const operationStore = new TypeOrmImportOperationStore(database.manager);
      await operationStore.admit(key, hash);
      expect(
        (await operationStore.admit(key, 'b'.repeat(64))).requestHash,
      ).toBe(hash);

      const confirmedAt = new Date('2026-10-29T12:34:56.789Z');
      const saved = await database.transaction(async (manager) => {
        const operations = new TypeOrmImportOperationStore(manager);
        expect((await operations.find(key, true))?.status).toBe('pending');
        const { transactions, ...evidence } = protectedPayload.evidence;
        expect(transactions).toHaveLength(10);
        const imported = await new TypeOrmStatementImportStore(manager).create({
          spaceId,
          importedByUserId: userId,
          ...payload.statement,
          totalDebit: null,
          importedAt: confirmedAt,
          confirmation: {
            evidence,
            includedCount: '2',
            excludedCount: '8',
            originalExpenseCount: '2',
            originalExpenseTotal: '1300.00',
            acknowledgedWarnings: [],
            acknowledgedWarningDigest: null,
          },
        });
        const rows = await new TypeOrmImportRowStore(manager).createRows(
          spaceId,
          imported.id,
          protectedPayload,
        );
        const expenses = await manager.getRepository(ExpenseEntity).save(
          rows
            .filter((row) => row.disposition === 'included')
            .map((row) => ({
              spaceId,
              addedByUserId: userId,
              categoryId: category.id,
              statementImportId: imported.id,
              sourceRowId: row.sourceRowId,
              statementImportRowId: row.id,
              expenseDate: row.confirmedValues!.expenseDate,
              description: row.confirmedValues!.description,
              amount: row.confirmedValues!.amount,
              importFingerprint: 'a'.repeat(64),
              referenceHash: row.originalEvidence.referenceHash,
            })),
        );
        const result = {
          status: 'committed' as const,
          operationId: key.operationId,
          statementImportId: imported.id,
          confirmedAt: confirmedAt.toISOString(),
          originalExpenseCount: '2',
          originalExpenseTotal: '1300.00',
        };
        await operations.commit(key, result);
        return { imported, rows, expenses, result };
      });
      expect(saved.imported.importedAt).toEqual(confirmedAt);
      const initialRows = await new TypeOrmImportRowStore(
        database.manager,
      ).findRows(spaceId, saved.imported.id);
      expect(initialRows).toHaveLength(10);
      expect(JSON.stringify(initialRows)).not.toContain('duplicateReference');
      expect(JSON.stringify(initialRows)).not.toContain('fictional-ref-');
      await database.getRepository(ExpenseEntity).update(saved.expenses[0].id, {
        amount: '150.00',
        description: 'Edited',
      });
      await database
        .getRepository(ExpenseEntity)
        .update(saved.expenses[1].id, { deletedAt: new Date() });
      expect(
        await new TypeOrmImportRowStore(database.manager).findRows(
          spaceId,
          saved.imported.id,
        ),
      ).toEqual(initialRows);
      expect((await operationStore.find(key, false))?.successResult).toEqual(
        saved.result,
      );
      expect(
        (
          await new TypeOrmStatementImportStore(
            database.manager,
          ).findByIdInSpace(spaceId, saved.imported.id)
        )?.confirmation?.originalExpenseTotal,
      ).toBe('1300.00');

      await expect(
        database
          .getRepository(StatementImportRowEntity)
          .update(saved.rows[0].id, {
            confirmedValues: { ...payload.expenses[0], amount: '1.00' },
          }),
      ).rejects.toThrow('Immutable');
      await expect(
        database
          .getRepository(StatementImportEntity)
          .update(saved.imported.id, { originalExpenseTotal: '1.00' }),
      ).rejects.toThrow('Immutable');
      await expect(
        database
          .getRepository(StatementImportOperationEntity)
          .update(key, { requestHash: 'c'.repeat(64) }),
      ).rejects.toThrow('Immutable');
      await expect(
        database.getRepository(ExpenseEntity).update(saved.expenses[0].id, {
          statementImportRowId: saved.rows[1].id,
        }),
      ).rejects.toThrow('Immutable');
      await expect(
        database
          .getRepository(StatementImportRowEntity)
          .insert({ ...saved.rows[0], id: undefined }),
      ).rejects.toThrow();
      await expect(
        database.getRepository(StatementImportRowEntity).insert({
          ...saved.rows[0],
          id: undefined,
          spaceId: spaceIds[1],
          sourceRowId: 'cross-space',
        }),
      ).rejects.toThrow();
      const another = { ...key, operationId: randomUUID() };
      await operationStore.admit(another, hash);
      await expect(
        operationStore.commit(another, {
          ...saved.result,
          operationId: another.operationId,
        }),
      ).rejects.toThrow();
      await database.getRepository(ExpenseEntity).delete({ spaceId });
      await database
        .getRepository(StatementImportOperationEntity)
        .delete({ spaceId });
      await database
        .getRepository(StatementImportEntity)
        .delete(saved.imported.id);
      expect(
        await database
          .getRepository(StatementImportRowEntity)
          .countBy({ statementImportId: saved.imported.id }),
      ).toBe(0);
    });

    it('stores only safe terminal rejection metadata and freezes failed operations', async () => {
      const store = new TypeOrmImportOperationStore(database.manager);
      const key = {
        actorUserId: users[0].id,
        spaceId: spaceIds[0],
        operationId: randomUUID(),
      };
      await store.admit(key, 'a'.repeat(64));
      await store.reject(key, {
        code: 'VALIDATION_FAILED',
        details: [{ field: '/expenses/0/amount', code: 'invalid' }],
      });
      const operation = await store.find(key, false);
      expect(operation?.status).toBe('not_committed');
      expect(operation?.failure).toEqual({
        code: 'VALIDATION_FAILED',
        details: [{ field: '/expenses/0/amount', code: 'invalid' }],
      });
      await expect(
        store.reject(key, { code: 'VALIDATION_FAILED', details: [] }),
      ).rejects.toThrow('not pending');
    });

    it('stores manual and imported Expenses with valid same-Space relationships', async () => {
      const [firstUser, secondUser] = users;
      const [firstSpace, secondSpace] = spaceIds;
      const categories = await database.getRepository(CategoryEntity).save([
        { spaceId: firstSpace, name: 'First Category', isActive: true },
        { spaceId: secondSpace, name: 'Second Category', isActive: true },
      ]);
      const imports = await database.getRepository(StatementImportEntity).save([
        {
          spaceId: firstSpace,
          importedByUserId: firstUser.id,
          fileName: 'first.pdf',
          fileHash: 'a'.repeat(64),
          statementDate: '2026-09-01',
          provider: 'bdo',
          accountFormat: 'visa',
          statementType: 'credit_card',
        },
        {
          spaceId: secondSpace,
          importedByUserId: secondUser.id,
          fileName: 'second.pdf',
          fileHash: 'b'.repeat(64),
          statementDate: '2026-09-01',
          provider: 'eastwest',
          accountFormat: 'visa',
          statementType: 'credit_card',
        },
      ]);

      const [imported, manual] = await database
        .getRepository(ExpenseEntity)
        .save([
          {
            spaceId: firstSpace,
            addedByUserId: firstUser.id,
            categoryId: categories[0].id,
            statementImportId: imports[0].id,
            sourceRowId: 'imported-row-1',
            expenseDate: '2026-09-02',
            description: 'Imported Expense',
            amount: '12.34',
            importFingerprint: 'c'.repeat(64),
          },
          {
            spaceId: firstSpace,
            addedByUserId: firstUser.id,
            categoryId: categories[0].id,
            statementImportId: null,
            expenseDate: '2026-09-03',
            description: 'Manual Expense',
            amount: '5.67',
            importFingerprint: null,
          },
        ]);

      expect(imported).toMatchObject({
        spaceId: firstSpace,
        categoryId: categories[0].id,
        statementImportId: imports[0].id,
      });
      expect(manual).toMatchObject({
        spaceId: firstSpace,
        categoryId: categories[0].id,
        statementImportId: null,
      });
    });

    it('rejects cross-Space Category and Statement Import references', async () => {
      const [firstUser, secondUser] = users;
      const [firstSpace, secondSpace] = spaceIds;
      const categories = await database.getRepository(CategoryEntity).save([
        { spaceId: firstSpace, name: 'First Category', isActive: true },
        { spaceId: secondSpace, name: 'Second Category', isActive: true },
      ]);
      const statementImport = await database
        .getRepository(StatementImportEntity)
        .save({
          spaceId: firstSpace,
          importedByUserId: firstUser.id,
          fileName: 'first.pdf',
          fileHash: 'c'.repeat(64),
          statementDate: '2026-09-01',
          provider: 'bdo',
          accountFormat: 'visa',
          statementType: 'credit_card',
        });
      const repo = database.getRepository(ExpenseEntity);
      const crossSpaceProvenance = {
        spaceId: secondSpace,
        addedByUserId: secondUser.id,
        categoryId: categories[1].id,
        statementImportId: statementImport.id,
        sourceRowId: 'cross-space-row',
        expenseDate: '2026-09-04',
        description: 'Cross-Space provenance',
        amount: '1.00',
      };
      const crossSpaceCategory = {
        ...crossSpaceProvenance,
        categoryId: categories[0].id,
        statementImportId: null,
        sourceRowId: null,
      };

      await expect(repo.save(crossSpaceProvenance)).rejects.toMatchObject({
        driverError: {
          code: '23503',
          constraint: 'fk_expenses_statement_import_space',
        },
      });
      await expect(repo.save(crossSpaceCategory)).rejects.toMatchObject({
        driverError: {
          code: '23503',
          constraint: 'fk_expenses_category_space',
        },
      });
    });
  },
);
