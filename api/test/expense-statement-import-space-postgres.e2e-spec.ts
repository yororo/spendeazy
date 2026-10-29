import { ReviewedImportService } from '../src/statement-imports/application/reviewed-import.service';
import { TypeOrmReviewedImportUnitOfWork } from '../src/statement-imports/infrastructure/typeorm-reviewed-import-unit-of-work';
import type { ReviewedImportContext } from '../src/statement-imports/application/reviewed-import-unit-of-work';
import type { ConfirmationPayload } from '../src/statement-imports/application/confirmation-payload';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
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

    async function reviewedFixture() {
      const category = await database
        .getRepository(CategoryEntity)
        .save({ spaceId: spaceIds[0], name: 'Reviewed', isActive: true });
      const payload = JSON.parse(
        readFileSync(
          resolve(
            __dirname,
            '../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
          ),
          'utf8',
        ),
      ) as ConfirmationPayload;
      for (const row of [...payload.expenses, ...payload.rememberedRules])
        row.categoryId = category.id;
      payload.acknowledgedWarnings = [];
      payload.acknowledgedWarningDigest = null;
      return { payload, category };
    }
    function reviewedService(
      decorate?: (context: ReviewedImportContext) => void,
    ) {
      const work = new TypeOrmReviewedImportUnitOfWork(database);
      return new ReviewedImportService(
        {
          execute: (fn) =>
            work.execute((context) => {
              decorate?.(context);
              return fn(context);
            }),
        },
        new NodeGCashReferenceHasher('fictional-key'),
        () => new Date('2026-10-30T00:00:00Z'),
      );
    }
    async function acknowledge(
      service: ReviewedImportService,
      payload: ConfirmationPayload,
    ) {
      const preview = await service.preview(users[0].id, spaceIds[0], payload);
      payload.acknowledgedWarnings = preview.warnings.map((row) => row.id);
      payload.acknowledgedWarningDigest = preview.warnings.length
        ? preview.warningDigest
        : null;
      return preview;
    }
    it('previews without writes and serializes simultaneous identical operations into one immutable result', async () => {
      const { payload } = await reviewedFixture();
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = false;
      const service = reviewedService((context) => {
        const create = context.statementImports.create.bind(
          context.statementImports,
        ) as typeof context.statementImports.create;
        context.statementImports.create = async (input) => {
          if (!held) {
            held = true;
            enter();
            await barrier;
          }
          return create(input);
        };
      });
      await acknowledge(service, payload);
      expect(
        await database
          .getRepository(StatementImportOperationEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(0);
      expect(
        await database
          .getRepository(StatementImportEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(0);
      const id = randomUUID();
      const first = service.confirm(users[0].id, spaceIds[0], id, payload);
      await entered;
      const follower = service.confirm(users[0].id, spaceIds[0], id, payload);
      release();
      const results = await Promise.all([first, follower]);
      expect(results.map((row) => row.replayed).sort()).toEqual([false, true]);
      expect(results[0].result).toEqual(results[1].result);
      expect(results[0].result).toMatchObject({
        originalExpenseCount: '2',
        originalExpenseTotal: '1300.00',
      });
      expect(
        await database
          .getRepository(StatementImportEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(1);
      expect(
        await database
          .getRepository(StatementImportRowEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(10);
      expect(
        await database
          .getRepository(ExpenseActivityEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(2);
      await expect(
        service.confirm(users[0].id, spaceIds[0], id, {
          ...payload,
          expenses: payload.expenses.map((row, index) =>
            index === 0 ? { ...row, amount: '1001.00' } : row,
          ),
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_OPERATION_PAYLOAD_CONFLICT' });
    });
    it('refreshes all warning classes including retained deleted history, rejects stale acknowledgments durably, and allows intentional reimport', async () => {
      const { payload } = await reviewedFixture();
      const service = reviewedService();
      await acknowledge(service, payload);
      const first = await service.confirm(
        users[0].id,
        spaceIds[0],
        randomUUID(),
        payload,
      );
      await database
        .getRepository(ExpenseEntity)
        .update({ spaceId: spaceIds[0] }, { deletedAt: new Date() });
      const refreshed = await service.preview(
        users[0].id,
        spaceIds[0],
        payload,
      );
      expect(new Set(refreshed.warnings.map((row) => row.type))).toEqual(
        new Set(['reconciliation', 'exact_file', 'probable_duplicate']),
      );
      expect(
        refreshed.warnings
          .filter((row) => row.type === 'probable_duplicate')
          .flatMap((row) => row.expenseIds),
      ).toHaveLength(2);
      const staleId = randomUUID();
      for (let attempt = 0; attempt < 2; attempt++)
        await expect(
          service.confirm(users[0].id, spaceIds[0], staleId, payload),
        ).rejects.toMatchObject({
          code: 'IMPORT_REVIEW_REQUIRED',
          preview: refreshed,
        });
      expect(
        (
          await database
            .getRepository(StatementImportOperationEntity)
            .findOneByOrFail({ operationId: staleId })
        ).status,
      ).toBe('not_committed');
      await acknowledge(service, payload);
      const second = await service.confirm(
        users[0].id,
        spaceIds[0],
        randomUUID(),
        payload,
      );
      expect(second.result.statementImportId).not.toBe(
        first.result.statementImportId,
      );
      expect(
        await database
          .getRepository(StatementImportEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(2);
    });
    it('replays original success after edits, deactivation and archive with read authority and original actor binding', async () => {
      const { payload, category } = await reviewedFixture();
      const service = reviewedService();
      await acknowledge(service, payload);
      const id = randomUUID();
      const original = await service.confirm(
        users[0].id,
        spaceIds[0],
        id,
        payload,
      );
      await database
        .getRepository(ExpenseEntity)
        .update(
          { spaceId: spaceIds[0] },
          { amount: '150.00', deletedAt: new Date() },
        );
      await database
        .getRepository(CategoryEntity)
        .update(category.id, { isActive: false });
      await database.getRepository(SpaceMembershipEntity).save({
        userId: users[1].id,
        spaceId: spaceIds[0],
        accessLevel: 'read',
      });
      // Personal lifecycle cannot archive; use a retained Shared Space to exercise archived replay.
      await database.query(
        "UPDATE spaces SET kind = 'shared', personal_owner_user_id = NULL WHERE id = $1",
        [spaceIds[0]],
      );
      await database
        .getRepository(SpaceEntity)
        .update(spaceIds[0], { status: 'archived' });
      expect(
        await service.confirm(users[0].id, spaceIds[0], id, payload),
      ).toEqual({ result: original.result, replayed: true });
      const rows = await service.evidenceRows(
        users[0].id,
        spaceIds[0],
        original.result.statementImportId,
      );
      expect(rows).toHaveLength(payload.evidence.transactions.length);
      expect(
        rows
          .filter((row) => row.disposition === 'included')
          .map((row) => row.confirmedValues?.amount),
      ).toEqual(['1000.00', '300.00']);
      expect(JSON.stringify(rows)).not.toMatch(
        /duplicateReference|referenceHash|fictional-ref/u,
      );
      expect(rows[0].originalEvidence.original).toEqual(
        payload.evidence.transactions[0].original,
      );
      await expect(
        service.confirm(users[1].id, spaceIds[0], id, payload),
      ).rejects.toBeDefined();
      await database
        .getRepository(SpaceMembershipEntity)
        .delete({ userId: users[0].id, spaceId: spaceIds[0] });
      await expect(
        service.confirm(users[0].id, spaceIds[0], id, payload),
      ).rejects.toMatchObject({ code: 'SPACE_NOT_FOUND' });
      // Cleanup financial triggers require active Space.
      await database
        .getRepository(SpaceEntity)
        .update(spaceIds[0], { status: 'active' });
    });
    it('appends normalized Rules once, preserves unrelated revisions, and rejects inactive-owner conflicts atomically', async () => {
      const { payload, category } = await reviewedFixture();
      payload.rememberedRules = [
        {
          pattern: '  Fictional SHOP  ',
          matchType: 'exact',
          categoryId: category.id,
        },
        {
          pattern: 'fictional shop',
          matchType: 'exact',
          categoryId: category.id,
        },
      ];
      const service = reviewedService();
      await acknowledge(service, payload);
      await service.confirm(users[0].id, spaceIds[0], randomUUID(), payload);
      expect(
        await database
          .getRepository(CategoryRuleEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(1);
      expect(
        (
          await database
            .getRepository(CategoryEntity)
            .findOneByOrFail({ id: category.id })
        ).revision,
      ).toBe('2');
      expect(
        (
          await database
            .getRepository(SpaceEntity)
            .findOneByOrFail({ id: spaceIds[0] })
        ).categoryRulesRevision,
      ).toBe('1');
      await acknowledge(service, payload);
      await service.confirm(users[0].id, spaceIds[0], randomUUID(), payload);
      expect(
        (
          await database
            .getRepository(CategoryEntity)
            .findOneByOrFail({ id: category.id })
        ).revision,
      ).toBe('2');
      const other = await database.getRepository(CategoryEntity).save({
        spaceId: spaceIds[0],
        name: 'Inactive owner',
        isActive: false,
      });
      await database.getRepository(CategoryRuleEntity).save({
        spaceId: spaceIds[0],
        categoryId: other.id,
        pattern: 'Blocked',
        normalizedPattern: 'blocked',
        matchType: 'contains',
      });
      payload.rememberedRules = [
        { pattern: 'BLOCKED', matchType: 'contains', categoryId: category.id },
      ];
      await acknowledge(service, payload);
      await expect(
        service.confirm(users[0].id, spaceIds[0], randomUUID(), payload),
      ).rejects.toMatchObject({ code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS' });
      expect(
        await database
          .getRepository(StatementImportEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(2);
    });
    it.each(['rows', 'expenses', 'activity', 'rules', 'result'] as const)(
      'rolls back an unexpected failure after %s and permits identical pending retry',
      async (stage) => {
        const { payload } = await reviewedFixture();
        const service = reviewedService((context) => {
          const fail = async <T>(work: () => Promise<T>): Promise<T> => {
            await work();
            throw new Error('Injected database outcome');
          };
          if (stage === 'rows') {
            const work = context.rows.createRows.bind(
              context.rows,
            ) as typeof context.rows.createRows;
            context.rows.createRows = (...args) => fail(() => work(...args));
          }
          if (stage === 'expenses') {
            const work = context.importedExpenses.create.bind(
              context.importedExpenses,
            ) as typeof context.importedExpenses.create;
            context.importedExpenses.create = (...args) =>
              fail(() => work(...args));
          }
          if (stage === 'activity') {
            const work = context.expenseActivities.create.bind(
              context.expenseActivities,
            ) as typeof context.expenseActivities.create;
            context.expenseActivities.create = (...args) =>
              fail(() => work(...args));
          }
          if (stage === 'rules') {
            const work = context.appendRules.bind(
              context,
            ) as typeof context.appendRules;
            context.appendRules = (...args) => fail(() => work(...args));
          }
          if (stage === 'result') {
            const work = context.operations.commit.bind(
              context.operations,
            ) as typeof context.operations.commit;
            context.operations.commit = (...args) => fail(() => work(...args));
          }
        });
        await acknowledge(service, payload);
        const id = randomUUID();
        await expect(
          service.confirm(users[0].id, spaceIds[0], id, payload),
        ).rejects.toThrow('Injected database outcome');
        for (const entity of [
          StatementImportEntity,
          StatementImportRowEntity,
          ExpenseEntity,
          ExpenseActivityEntity,
          CategoryRuleEntity,
        ])
          expect(
            await database
              .getRepository(entity)
              .countBy({ spaceId: spaceIds[0] }),
          ).toBe(0);
        expect(
          (
            await database
              .getRepository(StatementImportOperationEntity)
              .findOneByOrFail({ operationId: id })
          ).status,
        ).toBe('pending');
        expect(
          (
            await reviewedService().confirm(
              users[0].id,
              spaceIds[0],
              id,
              payload,
            )
          ).replayed,
        ).toBe(false);
      },
    );
    it('serializes two separately acknowledged operations for one file and refreshes the follower warnings', async () => {
      const { payload } = await reviewedFixture();
      const service = reviewedService();
      await acknowledge(service, payload);
      const outcomes = await Promise.allSettled([
        service.confirm(users[0].id, spaceIds[0], randomUUID(), payload),
        service.confirm(users[0].id, spaceIds[0], randomUUID(), payload),
      ]);
      expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(
        1,
      );
      const failure = outcomes.find((row) => row.status === 'rejected');
      expect(failure).toMatchObject({
        reason: { code: 'IMPORT_REVIEW_REQUIRED' },
      });
      expect(
        await database
          .getRepository(StatementImportEntity)
          .countBy({ spaceId: spaceIds[0] }),
      ).toBe(1);
    });
    it('waits for Category configuration and revalidates deactivation before any financial write', async () => {
      const { payload, category } = await reviewedFixture();
      const service = reviewedService();
      await acknowledge(service, payload);
      const runner = database.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT id FROM spaces WHERE id = $1 FOR UPDATE', [
          spaceIds[0],
        ]);
        await runner.manager
          .getRepository(CategoryEntity)
          .update(category.id, { isActive: false });
        const pending = service.confirm(
          users[0].id,
          spaceIds[0],
          randomUUID(),
          payload,
        );
        await runner.commitTransaction();
        await expect(pending).rejects.toMatchObject({
          code: 'CATEGORY_INACTIVE',
        });
        expect(
          await database
            .getRepository(StatementImportEntity)
            .countBy({ spaceId: spaceIds[0] }),
        ).toBe(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    });
    it('waits behind an archiving actor/Space lock and rejects a new operation without financial writes', async () => {
      const { payload } = await reviewedFixture();
      let entering!: () => void;
      const entered = new Promise<void>((resolve) => {
        entering = resolve;
      });
      const service = reviewedService((context) => {
        const lock = context.lockExecutionScope.bind(
          context,
        ) as typeof context.lockExecutionScope;
        context.lockExecutionScope = async (...args) => {
          entering();
          return lock(...args);
        };
      });
      await acknowledge(service, payload);
      await database.query(
        "UPDATE spaces SET kind = 'shared', personal_owner_user_id = NULL WHERE id = $1",
        [spaceIds[0]],
      );
      const runner = database.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
          users[0].id,
        ]);
        await runner.query('SELECT id FROM spaces WHERE id = $1 FOR UPDATE', [
          spaceIds[0],
        ]);
        await runner.manager
          .getRepository(SpaceEntity)
          .update(spaceIds[0], { status: 'archived' });
        const pending = service.confirm(
          users[0].id,
          spaceIds[0],
          randomUUID(),
          payload,
        );
        await entered;
        await runner.commitTransaction();
        await expect(pending).rejects.toMatchObject({
          code: 'SPACE_NOT_WRITABLE',
        });
        expect(
          await database
            .getRepository(StatementImportEntity)
            .countBy({ spaceId: spaceIds[0] }),
        ).toBe(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        await database
          .getRepository(SpaceEntity)
          .update(spaceIds[0], { status: 'active' });
      }
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
