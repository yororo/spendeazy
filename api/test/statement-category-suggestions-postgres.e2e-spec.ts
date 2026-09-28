import { randomUUID } from 'node:crypto';
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
import type { CategorySuggestionEvaluator } from '../src/statement-imports/application/statement-category-suggestions';
import { StatementCategorySuggestionsService } from '../src/statement-imports/application/statement-category-suggestions.service';
import { TypeOrmStatementCategorySuggestionCatalog } from '../src/statement-imports/infrastructure/typeorm-statement-category-suggestion-catalog';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl =
  process.env.TEST_STATEMENT_CATEGORY_SUGGESTIONS_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase(
  'statement Category Suggestion examples with PostgreSQL',
  () => {
    let database: DataSource;
    let userId: string;
    let otherUserId: string;
    let personalSpaceId: string;
    let otherPersonalSpaceId: string;
    let sharedSpaceId: string;

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
          clerkUserId: `${suffix}-owner`,
          name: 'Suggestion owner',
          email: `${suffix}-owner@example.test`,
        },
        {
          clerkUserId: `${suffix}-other`,
          name: 'Other Space owner',
          email: `${suffix}-other@example.test`,
        },
      ]);
      userId = users[0].id;
      otherUserId = users[1].id;

      const spaces = new TypeOrmSpaceStore(database.manager);
      personalSpaceId = await spaces.ensurePersonalSpace(userId);
      otherPersonalSpaceId = await spaces.ensurePersonalSpace(otherUserId);
      const sharedSpace = await database.getRepository(SpaceEntity).save({
        kind: 'shared',
        status: 'active',
        personalOwnerUserId: null,
      });
      sharedSpaceId = sharedSpace.id;
      await database.getRepository(SpaceMembershipEntity).save([
        { spaceId: sharedSpaceId, userId, accessLevel: 'write' },
        { spaceId: sharedSpaceId, userId: otherUserId, accessLevel: 'write' },
      ]);
      await database
        .getRepository(UserEntity)
        .update([userId, otherUserId], { activeSharedSpaceId: sharedSpaceId });
    });

    afterEach(async () => {
      if (!database?.isInitialized) return;

      for (const spaceId of [
        sharedSpaceId,
        personalSpaceId,
        otherPersonalSpaceId,
      ]) {
        if (!spaceId) continue;
        await database.getRepository(TransactionEntity).delete({ spaceId });
        await database.getRepository(StatementImportEntity).delete({ spaceId });
        await database.getRepository(CategoryEntity).delete({ spaceId });
      }
      if (sharedSpaceId) {
        await database
          .getRepository(SpaceMembershipEntity)
          .delete({ spaceId: sharedSpaceId });
        await database.getRepository(SpaceEntity).delete({ id: sharedSpaceId });
      }
      if (userId)
        await database.getRepository(UserEntity).delete({ id: userId });
      if (otherUserId) {
        await database.getRepository(UserEntity).delete({ id: otherUserId });
      }
    });

    afterAll(async () => {
      if (database?.isInitialized) await database.destroy();
    });

    it('includes current manual and imported assignments only from the destination Space', async () => {
      const [manualCategory, importedCategory, inactiveCategory] =
        await database.getRepository(CategoryEntity).save([
          {
            spaceId: sharedSpaceId,
            name: 'Groceries',
            description: 'Food and household supplies',
            isActive: true,
          },
          {
            spaceId: sharedSpaceId,
            name: 'Transport',
            description: 'Getting around',
            isActive: true,
          },
          {
            spaceId: sharedSpaceId,
            name: 'Retired',
            description: null,
            isActive: false,
          },
        ]);
      const personalCategory = await database
        .getRepository(CategoryEntity)
        .save({
          spaceId: personalSpaceId,
          name: 'Personal groceries',
          description: null,
          isActive: true,
        });
      const otherCategory = await database.getRepository(CategoryEntity).save({
        spaceId: otherPersonalSpaceId,
        name: 'Other groceries',
        description: null,
        isActive: true,
      });
      const statementImport = await database
        .getRepository(StatementImportEntity)
        .save({
          spaceId: sharedSpaceId,
          importedByUserId: userId,
          fileName: 'fictional-statement.pdf',
          fileHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          statementDate: '2026-09-09',
          bank: 'Fictional Bank',
          cardType: null,
          statementType: 'credit_card',
          transactionHistoryStartDate: null,
          totalDebit: '40.00',
        });

      await database
        .getRepository(TransactionEntity)
        .save([
          transactionFixture(
            sharedSpaceId,
            userId,
            manualCategory.id,
            'Metro Mart shared manual purchase',
            '2026-09-08',
          ),
          transactionFixture(
            sharedSpaceId,
            userId,
            importedCategory.id,
            'Metro Mart shared imported purchase',
            '2026-09-07',
            statementImport.id,
          ),
          transactionFixture(
            sharedSpaceId,
            userId,
            manualCategory.id,
            'Metro Mart deleted purchase',
            '2026-09-10',
            null,
            new Date('2026-09-11T00:00:00.000Z'),
          ),
          transactionFixture(
            sharedSpaceId,
            userId,
            null,
            'Metro Mart uncategorized purchase',
            '2026-09-09',
          ),
          transactionFixture(
            sharedSpaceId,
            userId,
            inactiveCategory.id,
            'Metro Mart retired purchase',
            '2026-09-09',
          ),
          transactionFixture(
            personalSpaceId,
            userId,
            personalCategory.id,
            'Metro Mart personal purchase',
            '2026-09-09',
          ),
          transactionFixture(
            otherPersonalSpaceId,
            otherUserId,
            otherCategory.id,
            'Metro Mart another User purchase',
            '2026-09-09',
          ),
        ]);

      const evaluation = createSuggestionEvaluator().mockResolvedValue(null);
      const service = createSuggestionsService(evaluation);
      await service.suggestInSpace(sharedSpaceId, 'Metro Mart');

      expect(evaluation).toHaveBeenCalledWith(
        'Metro Mart',
        [
          expect.objectContaining({ id: manualCategory.id, name: 'Groceries' }),
          expect.objectContaining({
            id: importedCategory.id,
            name: 'Transport',
          }),
        ],
        [
          {
            categoryId: manualCategory.id,
            description: 'Metro Mart shared manual purchase',
          },
          {
            categoryId: importedCategory.id,
            description: 'Metro Mart shared imported purchase',
          },
        ],
      );
    });

    it('uses renamed Categories and a corrected Transaction assignment, then omits deleted history', async () => {
      const [originalCategory, correctedCategory] = await database
        .getRepository(CategoryEntity)
        .save([
          {
            spaceId: sharedSpaceId,
            name: 'Unclear label',
            description: null,
            isActive: true,
          },
          {
            spaceId: sharedSpaceId,
            name: 'Utilities',
            description: 'Household utilities',
            isActive: true,
          },
        ]);
      const transaction = await database
        .getRepository(TransactionEntity)
        .save(
          transactionFixture(
            sharedSpaceId,
            userId,
            originalCategory.id,
            'Cafe Moon merchant',
            '2026-09-08',
          ),
        );
      const evaluation = createSuggestionEvaluator().mockResolvedValue(null);
      const service = createSuggestionsService(evaluation);

      await service.suggestInSpace(sharedSpaceId, 'Cafe Moon purchase');
      expect(evaluation.mock.calls[0]?.[2]).toEqual([
        { categoryId: originalCategory.id, description: 'Cafe Moon merchant' },
      ]);

      await database.getRepository(CategoryEntity).update(originalCategory.id, {
        name: 'Dining',
        description: 'Restaurants and cafes',
      });
      await service.suggestInSpace(sharedSpaceId, 'Cafe Moon purchase');
      expect(evaluation.mock.calls[1]?.[1]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: originalCategory.id,
            name: 'Dining',
            description: 'Restaurants and cafes',
          }),
        ]),
      );

      await database.getRepository(TransactionEntity).update(transaction.id, {
        categoryId: correctedCategory.id,
      });
      await service.suggestInSpace(sharedSpaceId, 'Cafe Moon purchase');
      expect(evaluation.mock.calls[2]?.[2]).toEqual([
        { categoryId: correctedCategory.id, description: 'Cafe Moon merchant' },
      ]);

      await database.getRepository(TransactionEntity).update(transaction.id, {
        deletedAt: new Date('2026-09-12T00:00:00.000Z'),
      });
      await service.suggestInSpace(sharedSpaceId, 'Cafe Moon purchase');
      expect(evaluation.mock.calls[3]?.[2]).toEqual([]);
    });

    it('does not use examples whose current Category is inactive', async () => {
      const [activeCategory, inactiveCategory] = await database
        .getRepository(CategoryEntity)
        .save([
          {
            spaceId: sharedSpaceId,
            name: 'Active',
            description: null,
            isActive: true,
          },
          {
            spaceId: sharedSpaceId,
            name: 'Inactive',
            description: null,
            isActive: true,
          },
        ]);
      await database
        .getRepository(TransactionEntity)
        .save(
          transactionFixture(
            sharedSpaceId,
            userId,
            inactiveCategory.id,
            'Metro Mart retired Category example',
            '2026-09-08',
          ),
        );
      await database.getRepository(CategoryEntity).update(inactiveCategory.id, {
        isActive: false,
      });

      const evaluation = createSuggestionEvaluator().mockResolvedValue(null);
      const service = createSuggestionsService(evaluation);
      await service.suggestInSpace(sharedSpaceId, 'Metro Mart');

      expect(evaluation).toHaveBeenCalledWith(
        'Metro Mart',
        [expect.objectContaining({ id: activeCategory.id, name: 'Active' })],
        [],
      );
    });

    it('caps relevant examples at sixteen while keeping all active Category options', async () => {
      const categories = await database.getRepository(CategoryEntity).save(
        Array.from({ length: 20 }, (_, index) => ({
          spaceId: sharedSpaceId,
          name: `Category ${index}`,
          description: null,
          isActive: true,
        })),
      );
      await database
        .getRepository(TransactionEntity)
        .save(
          categories.map((category, index) =>
            transactionFixture(
              sharedSpaceId,
              userId,
              category.id,
              `Metro Mart purchase ${index}`,
              `2026-09-${String(index + 1).padStart(2, '0')}`,
            ),
          ),
        );

      const evaluation = createSuggestionEvaluator().mockResolvedValue(null);
      const service = createSuggestionsService(evaluation);
      await service.suggestInSpace(sharedSpaceId, 'Metro Mart purchase');

      const sentCategories = evaluation.mock.calls[0]?.[1] as
        readonly { id: string }[] | undefined;
      const sentExamples = evaluation.mock.calls[0]?.[2] as
        readonly { categoryId: string; description: string }[] | undefined;
      expect(sentCategories).toHaveLength(20);
      expect(sentExamples).toHaveLength(16);
      expect(
        new Set(sentExamples?.map(({ categoryId }) => categoryId)).size,
      ).toBe(16);
    });

    function createSuggestionsService(
      evaluation: ReturnType<typeof createSuggestionEvaluator>,
    ) {
      return new StatementCategorySuggestionsService(
        new TypeOrmStatementCategorySuggestionCatalog(database.manager),
        { suggestCategory: evaluation },
      );
    }
  },
);

function createSuggestionEvaluator() {
  type SuggestCategory = CategorySuggestionEvaluator['suggestCategory'];
  return jest.fn<ReturnType<SuggestCategory>, Parameters<SuggestCategory>>();
}

function transactionFixture(
  spaceId: string,
  addedByUserId: string,
  categoryId: string | null,
  description: string,
  purchaseDate: string,
  statementImportId: string | null = null,
  deletedAt: Date | null = null,
) {
  return {
    spaceId,
    addedByUserId,
    categoryId,
    statementImportId,
    purchaseDate,
    description,
    amount: '10.00',
    categoryMatchConfidence: null,
    importFingerprint: null,
    referenceHash: null,
    deletedAt,
  };
}
