import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionActivityEntity } from '../src/database/entities/transaction-activity.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { CategoriesService } from '../src/categories/application/categories.service';
import { TypeOrmCategoryStore } from '../src/categories/infrastructure/typeorm-category-store';
import { TypeOrmStatementImportConfirmationUnitOfWork } from '../src/database/unit-of-work';
import {
  StatementImportsService,
  type CommitReviewedStatementImportInput,
} from '../src/statement-imports/application/statement-imports.service';
import { TypeOrmStatementImportStore } from '../src/statement-imports/infrastructure/typeorm-statement-import-store';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl =
  process.env.TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'Statement Import Category concurrency with PostgreSQL',
  () => {
    let database: DataSource;
    let statementImports: StatementImportsService;
    let categories: CategoriesService;
    let userId: string | undefined;
    let personalSpaceId: string | undefined;
    let categoryId: string | undefined;

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

      statementImports = new StatementImportsService(
        new TypeOrmStatementImportStore(database.manager),
        new TypeOrmStatementImportConfirmationUnitOfWork(database),
      );
      categories = new CategoriesService(
        new TypeOrmCategoryStore(database.manager),
      );
    });

    beforeEach(async () => {
      const unique = randomUUID();
      const user = await database.getRepository(UserEntity).save({
        clerkUserId: unique,
        name: 'Category concurrency test',
        email: `${unique}@example.test`,
      });
      userId = user.id;
      personalSpaceId = await new TypeOrmSpaceStore(
        database.manager,
      ).ensurePersonalSpace(user.id);

      const category = await database.getRepository(CategoryEntity).save({
        spaceId: personalSpaceId,
        name: 'Utilities',
        isActive: true,
      });
      categoryId = category.id;
    });

    afterEach(async () => {
      if (
        !database?.isInitialized ||
        userId === undefined ||
        personalSpaceId === undefined
      ) {
        return;
      }

      await database.getRepository(TransactionActivityEntity).delete({
        spaceId: personalSpaceId,
      });
      await database.getRepository(TransactionEntity).delete({
        spaceId: personalSpaceId,
      });
      await database.getRepository(StatementImportEntity).delete({
        spaceId: personalSpaceId,
      });
      await database.getRepository(CategoryEntity).delete({
        spaceId: personalSpaceId,
      });
      await database.getRepository(UserEntity).delete({ id: userId });

      userId = undefined;
      personalSpaceId = undefined;
      categoryId = undefined;
    });

    afterAll(async () => {
      if (database?.isInitialized) {
        await database.destroy();
      }
    });

    it('rejects confirmation without writes when Category retirement reaches the lock first', async () => {
      const currentUserId = requireValue(userId, 'test User');
      const spaceId = requireValue(personalSpaceId, 'test Space');
      const currentCategoryId = requireValue(categoryId, 'test Category');
      const gate = await installAdvisoryGate(database, 'categories', 'UPDATE');
      let retirement: Promise<unknown> | undefined;
      let confirmation: Promise<unknown> | undefined;

      try {
        retirement = categories.updateCategoryInSpace(
          spaceId,
          currentCategoryId,
          {
            isActive: false,
          },
        );
        await waitForAdvisoryWaiter(database, gate.lockKey);

        confirmation = statementImports.commitReviewedStatementImportInSpace(
          currentUserId,
          spaceId,
          createImportInput(currentCategoryId, 'retirement-wins'),
        );

        await releaseAdvisoryGate(gate);
        await expect(retirement).resolves.toMatchObject({ isActive: false });
        await expect(confirmation).rejects.toMatchObject({
          code: 'CATEGORY_INACTIVE',
        });
      } finally {
        await releaseAdvisoryGate(gate);
        await settle(retirement, confirmation);
        await removeAdvisoryGate(database, gate);
      }

      await expect(
        database.getRepository(StatementImportEntity).countBy({
          spaceId,
        }),
      ).resolves.toBe(0);
      await expect(
        database.getRepository(TransactionEntity).countBy({ spaceId }),
      ).resolves.toBe(0);
      await expect(
        database.getRepository(TransactionActivityEntity).countBy({ spaceId }),
      ).resolves.toBe(0);
      await expect(
        database.getRepository(CategoryEntity).findOneByOrFail({
          id: currentCategoryId,
          spaceId,
        }),
      ).resolves.toMatchObject({ isActive: false });
    });

    it('commits the complete import before Category retirement when confirmation reaches the lock first', async () => {
      const currentUserId = requireValue(userId, 'test User');
      const spaceId = requireValue(personalSpaceId, 'test Space');
      const currentCategoryId = requireValue(categoryId, 'test Category');
      const gate = await installAdvisoryGate(
        database,
        'statement_imports',
        'INSERT',
      );
      let confirmation: Promise<unknown> | undefined;
      let retirement: Promise<unknown> | undefined;

      try {
        confirmation = statementImports.commitReviewedStatementImportInSpace(
          currentUserId,
          spaceId,
          createImportInput(currentCategoryId, 'confirmation-wins'),
        );
        await waitForAdvisoryWaiter(database, gate.lockKey);

        retirement = categories.updateCategoryInSpace(
          spaceId,
          currentCategoryId,
          {
            isActive: false,
          },
        );

        await releaseAdvisoryGate(gate);
        await expect(confirmation).resolves.toMatchObject({ spaceId });
        await expect(retirement).resolves.toMatchObject({ isActive: false });
      } finally {
        await releaseAdvisoryGate(gate);
        await settle(confirmation, retirement);
        await removeAdvisoryGate(database, gate);
      }

      await expect(
        database.getRepository(StatementImportEntity).countBy({ spaceId }),
      ).resolves.toBe(1);
      await expect(
        database.getRepository(TransactionEntity).countBy({ spaceId }),
      ).resolves.toBe(1);
      await expect(
        database.getRepository(TransactionActivityEntity).countBy({ spaceId }),
      ).resolves.toBe(1);
      await expect(
        database.getRepository(CategoryEntity).findOneByOrFail({
          id: currentCategoryId,
          spaceId,
        }),
      ).resolves.toMatchObject({ isActive: false });
    });
  },
);

interface AdvisoryGate {
  functionName: string;
  lockKey: number;
  queryRunner: QueryRunner;
  targetTable: string;
  triggerName: string;
  released: boolean;
}

async function installAdvisoryGate(
  database: DataSource,
  tableName: string,
  operation: 'INSERT' | 'UPDATE',
): Promise<AdvisoryGate> {
  const suffix = randomUUID().replaceAll('-', '');
  const gate: AdvisoryGate = {
    functionName: `statement_import_category_gate_fn_${suffix}`,
    lockKey: Number.parseInt(suffix.slice(0, 7), 16) + 1,
    queryRunner: database.createQueryRunner(),
    targetTable: tableName,
    triggerName: `statement_import_category_gate_${suffix}`,
    released: false,
  };

  await gate.queryRunner.connect();
  await gate.queryRunner.query('SELECT pg_advisory_lock($1::integer)', [
    gate.lockKey,
  ]);
  await database.query(`
    CREATE FUNCTION "${gate.functionName}"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      PERFORM pg_advisory_xact_lock(${gate.lockKey});
      RETURN NEW;
    END;
    $function$;
  `);
  await database.query(`
    CREATE TRIGGER "${gate.triggerName}"
    BEFORE ${operation} ON "${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION "${gate.functionName}"();
  `);

  return gate;
}

async function waitForAdvisoryWaiter(
  database: DataSource,
  lockKey: number,
): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const rows: { count: number | string }[] = await database.query(
      `
        SELECT COUNT(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = 0
          AND objid = $1::oid
          AND objsubid = 1
          AND granted = false
      `,
      [lockKey],
    );
    if (Number(rows[0]?.count) > 0) return;

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(`Advisory lock ${lockKey} did not receive a waiter`);
}

async function releaseAdvisoryGate(gate: AdvisoryGate): Promise<void> {
  if (gate.released) return;

  await gate.queryRunner.query('SELECT pg_advisory_unlock($1::integer)', [
    gate.lockKey,
  ]);
  gate.released = true;
}

async function removeAdvisoryGate(
  database: DataSource,
  gate: AdvisoryGate,
): Promise<void> {
  if (!gate.queryRunner.isReleased) {
    await gate.queryRunner.release();
  }
  await database.query(
    `DROP TRIGGER IF EXISTS "${gate.triggerName}" ON "${gate.targetTable}"`,
  );
  await database.query(`DROP FUNCTION IF EXISTS "${gate.functionName}"()`);
}

async function settle(
  ...promises: (Promise<unknown> | undefined)[]
): Promise<void> {
  await Promise.allSettled(promises.filter((promise) => promise !== undefined));
}

function createImportInput(
  categoryId: string,
  seed: string,
): CommitReviewedStatementImportInput {
  return {
    fileName: `${seed}.pdf`,
    fileHash: uniqueHash(seed),
    statementDate: '2026-09-01',
    bank: 'Concurrency Bank',
    cardType: 'visa',
    transactions: [
      {
        categoryId,
        purchaseDate: '2026-09-01',
        description: `${seed} transaction`,
        amount: '4.50',
        categoryMatchConfidence: '0.9000',
      },
    ],
  };
}

function requireValue(value: string | undefined, label: string): string {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

function uniqueHash(seed: string): string {
  return createHash('sha256').update(`${seed}:${randomUUID()}`).digest('hex');
}
