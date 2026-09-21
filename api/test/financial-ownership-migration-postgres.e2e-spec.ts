import { DataSource } from 'typeorm';
import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';

const databaseUrl = process.env.TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

interface MigratedFinancialRow {
  category_id: string;
  space_id: string;
  color: string;
  budget_id: string;
  budget_amount: string;
  import_id: string;
  imported_by_user_id: string;
  transaction_id: string;
  transaction_amount: string;
  added_by_user_id: string;
  import_fingerprint: string;
  rule_id: string;
  rule_space_id: string;
}

describeDatabase(
  'historical financial ownership migration with PostgreSQL',
  () => {
    let database: DataSource;

    async function rows<T>(
      sql: string,
      parameters: unknown[] = [],
    ): Promise<T[]> {
      const result: unknown = await database.query(sql, parameters);
      if (!Array.isArray(result)) throw new Error('Expected PostgreSQL rows');
      return result as T[];
    }

    beforeAll(async () => {
      database = await new DataSource({
        type: 'postgres',
        url: databaseUrl,
        entities: DATABASE_ENTITIES,
        migrations: DATABASE_MIGRATIONS.slice(0, 4),
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
      }).initialize();
      const existingTables = await rows<{ users: string | null }>(
        "SELECT to_regclass('public.users') AS users",
      );
      if (existingTables[0]?.users !== null) {
        throw new Error(
          'Migration check requires an empty disposable database',
        );
      }
      await database.runMigrations();
    });

    afterAll(async () => {
      if (database?.isInitialized) await database.destroy();
    });

    it('preserves pre-Space IDs, amounts, relationships, actors, and duplicate scoping', async () => {
      const [owner] = await rows<{ id: string }>(
        "INSERT INTO users (clerk_user_id, name, email) VALUES ('migration-owner', 'Migration Owner', 'migration-owner@example.test') RETURNING id",
      );
      const [other] = await rows<{ id: string }>(
        "INSERT INTO users (clerk_user_id, name, email) VALUES ('migration-other', 'Migration Other', 'migration-other@example.test') RETURNING id",
      );
      const [category] = await rows<{ id: string }>(
        'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING id',
        [owner.id, 'Historical groceries', 'teal'],
      );
      const [budget] = await rows<{ id: string }>(
        'INSERT INTO budgets (category_id, period, amount) VALUES ($1, $2, $3) RETURNING id',
        [category.id, 'monthly', '125.50'],
      );
      const fileHash = 'a'.repeat(64);
      const fingerprint = 'b'.repeat(64);
      const [statementImport] = await rows<{ id: string }>(
        'INSERT INTO statement_imports (user_id, file_name, file_hash, statement_date, bank) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [owner.id, 'historical.pdf', fileHash, '2026-01-31', 'Example Bank'],
      );
      const [otherImport] = await rows<{ id: string }>(
        'INSERT INTO statement_imports (user_id, file_name, file_hash, statement_date, bank) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [other.id, 'same-hash.pdf', fileHash, '2026-01-31', 'Example Bank'],
      );
      const [transaction] = await rows<{ id: string }>(
        'INSERT INTO transactions (user_id, category_id, statement_import_id, purchase_date, description, amount, import_fingerprint) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [
          owner.id,
          category.id,
          statementImport.id,
          '2026-01-15',
          'Groceries',
          '42.75',
          fingerprint,
        ],
      );
      await database.query(
        'INSERT INTO transactions (user_id, statement_import_id, purchase_date, description, amount, import_fingerprint) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          other.id,
          otherImport.id,
          '2026-01-15',
          'Same fingerprint',
          '42.75',
          fingerprint,
        ],
      );
      const [rule] = await rows<{ id: string }>(
        'INSERT INTO category_rules (user_id, category_id, pattern, normalized_pattern, match_type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [owner.id, category.id, 'GROCERIES', 'groceries', 'exact'],
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
      await database.runMigrations();

      const [saved] = await rows<MigratedFinancialRow>(
        `SELECT c.id AS category_id, c.space_id, c.color,
              b.id AS budget_id, b.amount AS budget_amount,
              si.id AS import_id, si.imported_by_user_id,
              t.id AS transaction_id, t.amount AS transaction_amount,
              t.added_by_user_id, t.import_fingerprint,
              cr.id AS rule_id, cr.space_id AS rule_space_id
         FROM categories c
         JOIN budgets b ON b.category_id = c.id
         JOIN statement_imports si ON si.space_id = c.space_id
         JOIN transactions t ON t.category_id = c.id AND t.statement_import_id = si.id
         JOIN category_rules cr ON cr.category_id = c.id
        WHERE c.id = $1`,
        [category.id],
      );
      expect(saved).toMatchObject({
        category_id: category.id,
        color: 'teal',
        budget_id: budget.id,
        budget_amount: '125.50',
        import_id: statementImport.id,
        imported_by_user_id: owner.id,
        transaction_id: transaction.id,
        transaction_amount: '42.75',
        added_by_user_id: owner.id,
        import_fingerprint: fingerprint,
        rule_id: rule.id,
        rule_space_id: saved.space_id,
      });
      const [otherSaved] = await rows<{ id: string; space_id: string }>(
        'SELECT id, space_id FROM statement_imports WHERE id = $1',
        [otherImport.id],
      );
      expect(otherSaved).toMatchObject({ id: otherImport.id });
      expect(otherSaved.space_id).not.toBe(saved.space_id);
      const fingerprintScopes = await rows<{
        space_id: string;
        matches: string;
      }>(
        'SELECT space_id, COUNT(*)::text AS matches FROM transactions WHERE import_fingerprint = $1 GROUP BY space_id',
        [fingerprint],
      );
      expect(fingerprintScopes).toEqual(
        expect.arrayContaining([
          { space_id: saved.space_id, matches: '1' },
          { space_id: otherSaved.space_id, matches: '1' },
        ]),
      );
      await expect(
        database.query(
          'INSERT INTO statement_imports (space_id, imported_by_user_id, file_name, file_hash, statement_date, bank) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            saved.space_id,
            owner.id,
            'duplicate.pdf',
            fileHash,
            '2026-02-28',
            'Example Bank',
          ],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
      await expect(
        database.query(
          'INSERT INTO transactions (space_id, added_by_user_id, category_id, purchase_date, description, amount) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            otherSaved.space_id,
            other.id,
            category.id,
            '2026-02-01',
            'Cross-Space reference',
            '1.00',
          ],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });

      const [newUser] = await rows<{ id: string }>(
        "INSERT INTO users (clerk_user_id, name, email) VALUES ('migration-new', 'New User', 'migration-new@example.test') RETURNING id",
      );
      const spaces = new TypeOrmSpaceStore(database.manager);
      const personalSpaceId = await spaces.ensurePersonalSpace(newUser.id);
      expect(await spaces.ensurePersonalSpace(newUser.id)).toBe(
        personalSpaceId,
      );
      const [membership] = await rows<{ access_level: string }>(
        'SELECT access_level FROM space_memberships WHERE space_id = $1 AND user_id = $2',
        [personalSpaceId, newUser.id],
      );
      expect(membership.access_level).toBe('write');

      const legacyOwnershipColumns = await rows<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'user_id'
          AND table_name IN ('categories', 'category_rules', 'statement_imports', 'transactions')
      `);
      expect(legacyOwnershipColumns).toEqual([]);

      await expect(
        database.query(
          "INSERT INTO categories (name) VALUES ('Missing Space')",
        ),
      ).rejects.toMatchObject({ driverError: { code: '23502' } });
      await expect(
        database.query(
          `INSERT INTO transactions
             (space_id, purchase_date, description, amount)
           VALUES ($1, '2026-02-01', 'Missing actor', '1.00')`,
          [personalSpaceId],
        ),
      ).rejects.toMatchObject({ driverError: { code: '23502' } });
    });
  },
);
