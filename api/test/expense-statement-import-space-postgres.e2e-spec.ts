import { randomUUID } from 'node:crypto';
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
