import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import {
  computeImportFingerprint,
  StatementImportsService,
} from '../src/statement-imports/application/statement-imports.service';
import { TypeOrmStatementImportConfirmationUnitOfWork } from '../src/database/unit-of-work';
import { TypeOrmStatementImportStore } from '../src/statement-imports/infrastructure/typeorm-statement-import-store';

const databaseUrl = process.env.TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('Statement Import rollback with PostgreSQL', () => {
  let database: DataSource;
  let service: StatementImportsService;
  let userId: string | undefined;
  let sharedSpaceId: string | undefined;
  let failureTrigger: FailureTrigger | undefined;

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
    service = new StatementImportsService(
      new TypeOrmStatementImportStore(database.manager),
      new TypeOrmStatementImportConfirmationUnitOfWork(database),
    );
  });

  beforeEach(async () => {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: unique,
      name: 'Rollback test',
      email: `${unique}@example.test`,
    });
    userId = user.id;

    const categories = await database.getRepository(CategoryEntity).save([
      { userId, name: 'Existing category', isActive: true },
      { userId, name: 'Attempted category', isActive: true },
    ]);

    const existingImport = await database
      .getRepository(StatementImportEntity)
      .save({
        userId,
        fileName: 'existing.pdf',
        fileHash: uniqueHash('existing-import'),
        statementDate: '2026-08-31',
        bank: 'Existing Bank',
        cardType: 'visa',
      });

    await database.getRepository(TransactionEntity).save({
      userId,
      categoryId: categories[0].id,
      statementImportId: existingImport.id,
      purchaseDate: '2026-08-15',
      description: `Existing transaction ${unique}`,
      amount: '12.34',
      categoryMatchConfidence: null,
      importFingerprint: uniqueHash('existing-transaction'),
    });
  });

  afterEach(async () => {
    if (failureTrigger !== undefined) {
      await removeFailureTrigger(database, failureTrigger);
      failureTrigger = undefined;
    }

    if (!database?.isInitialized || userId === undefined) {
      return;
    }

    await database.getRepository(TransactionEntity).delete({ userId });
    await database.getRepository(StatementImportEntity).delete({ userId });
    await database.getRepository(CategoryEntity).delete({ userId });
    if (sharedSpaceId !== undefined) {
      await database.getRepository(SpaceEntity).delete({ id: sharedSpaceId });
      sharedSpaceId = undefined;
    }
    await database.getRepository(UserEntity).delete({ id: userId });
    userId = undefined;
  });

  afterAll(async () => {
    if (database?.isInitialized) {
      await database.destroy();
    }
  });

  it('rolls back the Committed Statement Import and all Transactions after a later write fails', async () => {
    const currentUserId = userId;
    if (currentUserId === undefined) {
      throw new Error('The rollback test User was not created');
    }

    const categories = await database
      .getRepository(CategoryEntity)
      .find({ where: { userId: currentUserId }, order: { id: 'ASC' } });
    const targetFileHash = uniqueHash('attempted-import');
    const firstDescription = `Attempted first transaction ${currentUserId}`;
    const failureDescription = `Force rollback failure ${currentUserId}`;
    const existingImport = await database
      .getRepository(StatementImportEntity)
      .findOneByOrFail({ userId: currentUserId, fileName: 'existing.pdf' });
    const existingTransaction = await database
      .getRepository(TransactionEntity)
      .findOneByOrFail({
        userId: currentUserId,
        statementImportId: existingImport.id,
      });

    failureTrigger = await installFailureTrigger(database, failureDescription);

    const spaceId = existingImport.spaceId;
    await expect(
      service.commitReviewedStatementImportInSpace(currentUserId, spaceId, {
        fileName: 'attempted-import.pdf',
        fileHash: targetFileHash,
        statementDate: '2026-09-01',
        bank: 'Rollback Bank',
        cardType: 'visa',
        transactions: [
          {
            categoryId: categories[1].id,
            purchaseDate: '2026-09-01',
            description: firstDescription,
            amount: '4.50',
            categoryMatchConfidence: '0.9000',
          },
          {
            categoryId: null,
            purchaseDate: '2026-09-02',
            description: failureDescription,
            amount: '5.50',
            categoryMatchConfidence: null,
          },
        ],
      }),
    ).rejects.toThrow('statement import rollback failure');

    const attemptedImport = await database
      .getRepository(StatementImportEntity)
      .findOneBy({ userId: currentUserId, fileHash: targetFileHash });
    const attemptedTransactions = await database
      .getRepository(TransactionEntity)
      .find({
        where: [
          { userId: currentUserId, description: firstDescription },
          { userId: currentUserId, description: failureDescription },
        ],
      });
    const persistedImport = await database
      .getRepository(StatementImportEntity)
      .findOneByOrFail({ id: existingImport.id, userId: currentUserId });
    const persistedTransaction = await database
      .getRepository(TransactionEntity)
      .findOneByOrFail({ id: existingTransaction.id, userId: currentUserId });

    expect(attemptedImport).toBeNull();
    expect(attemptedTransactions).toEqual([]);
    expect(persistedImport).toMatchObject({
      id: existingImport.id,
      fileName: 'existing.pdf',
      fileHash: existingImport.fileHash,
    });
    expect(persistedTransaction).toMatchObject({
      id: existingTransaction.id,
      statementImportId: existingImport.id,
      description: existingTransaction.description,
      amount: '12.34',
    });
    await expect(
      database
        .getRepository(StatementImportEntity)
        .countBy({ userId: currentUserId }),
    ).resolves.toBe(1);
    await expect(
      database
        .getRepository(TransactionEntity)
        .countBy({ userId: currentUserId }),
    ).resolves.toBe(1);
  });

  it('allows the same file in another Space without cross-Space duplicate warnings', async () => {
    const currentUserId = userId;
    if (currentUserId === undefined) {
      throw new Error('The cross-Space test User was not created');
    }

    const existingImport = await database
      .getRepository(StatementImportEntity)
      .findOneByOrFail({ userId: currentUserId, fileName: 'existing.pdf' });
    const existingTransaction = await database
      .getRepository(TransactionEntity)
      .findOneByOrFail({
        userId: currentUserId,
        statementImportId: existingImport.id,
      });
    const sharedSpace = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      categoryRulesRevision: '0',
      personalOwnerUserId: null,
    });
    sharedSpaceId = sharedSpace.id;
    await database.getRepository(SpaceMembershipEntity).save({
      spaceId: sharedSpace.id,
      userId: currentUserId,
      accessLevel: 'write',
    });
    const sharedCategory = await database.getRepository(CategoryEntity).save({
      userId: currentUserId,
      spaceId: sharedSpace.id,
      name: 'Shared category',
      isActive: true,
    });
    const input = {
      fileName: existingImport.fileName,
      fileHash: existingImport.fileHash,
      statementDate: existingImport.statementDate,
      bank: existingImport.bank,
      cardType: existingImport.cardType,
      transactions: [
        {
          categoryId: sharedCategory.id,
          purchaseDate: existingTransaction.purchaseDate,
          description: existingTransaction.description,
          amount: existingTransaction.amount,
          categoryMatchConfidence: null,
        },
      ],
    };
    existingTransaction.importFingerprint = computeImportFingerprint(
      input,
      input.transactions[0],
    );
    await database.getRepository(TransactionEntity).save(existingTransaction);

    const committedImport = await service.commitReviewedStatementImportInSpace(
      currentUserId,
      sharedSpace.id,
      input,
    );

    expect(committedImport.spaceId).toBe(sharedSpace.id);
    await expect(
      database.getRepository(StatementImportEntity).countBy({
        userId: currentUserId,
        fileHash: existingImport.fileHash,
      }),
    ).resolves.toBe(2);
    await expect(
      database.getRepository(TransactionEntity).countBy({
        userId: currentUserId,
        spaceId: sharedSpace.id,
        importFingerprint: existingTransaction.importFingerprint,
      }),
    ).resolves.toBe(1);
  });
});

interface FailureTrigger {
  triggerName: string;
  functionName: string;
}

async function installFailureTrigger(
  database: DataSource,
  failureDescription: string,
): Promise<FailureTrigger> {
  const suffix = randomUUID().replaceAll('-', '');
  const triggerName = `statement_import_rollback_${suffix}`;
  const functionName = `statement_import_rollback_fn_${suffix}`;

  await database.query(`
    CREATE FUNCTION "${functionName}"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW.description = '${failureDescription}' THEN
        RAISE EXCEPTION 'statement import rollback failure';
      END IF;
      RETURN NEW;
    END;
    $function$;
  `);
  await database.query(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION "${functionName}"();
  `);

  return { triggerName, functionName };
}

async function removeFailureTrigger(
  database: DataSource,
  failureTrigger: FailureTrigger,
): Promise<void> {
  await database.query(
    `DROP TRIGGER IF EXISTS "${failureTrigger.triggerName}" ON transactions`,
  );
  await database.query(
    `DROP FUNCTION IF EXISTS "${failureTrigger.functionName}"()`,
  );
}

function uniqueHash(seed: string): string {
  return createHash('sha256').update(`${seed}:${randomUUID()}`).digest('hex');
}
