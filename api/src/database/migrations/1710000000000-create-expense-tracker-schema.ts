import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpenseTrackerSchema1710000000000 implements MigrationInterface {
  name = 'CreateExpenseTrackerSchema1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        clerk_user_id VARCHAR(255) NOT NULL,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(320) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_users PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_users_clerk_user_id ON users (clerk_user_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_users_email ON users (LOWER(email))
    `);

    await queryRunner.query(`
      CREATE TABLE categories (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        user_id BIGINT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_categories PRIMARY KEY (id),
        CONSTRAINT uq_categories_id_user_id UNIQUE (id, user_id),
        CONSTRAINT fk_categories_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX ux_categories_user_name
        ON categories (user_id, LOWER(name))
    `);
    await queryRunner.query(`
      CREATE INDEX ix_categories_user_active
        ON categories (user_id, is_active)
    `);

    await queryRunner.query(`
      CREATE TABLE budgets (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        category_id BIGINT NOT NULL,
        period VARCHAR(20) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_budgets PRIMARY KEY (id),
        CONSTRAINT uq_budgets_category UNIQUE (category_id),
        CONSTRAINT fk_budgets_category FOREIGN KEY (category_id)
          REFERENCES categories (id) ON DELETE CASCADE,
        CONSTRAINT ck_budgets_period CHECK (period IN ('monthly', 'yearly')),
        CONSTRAINT ck_budgets_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE statement_imports (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        user_id BIGINT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_hash CHAR(64) NOT NULL,
        statement_date DATE NOT NULL,
        bank VARCHAR(100) NOT NULL,
        card_type VARCHAR(100),
        account_last4 CHAR(4),
        imported_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_statement_imports PRIMARY KEY (id),
        CONSTRAINT uq_statement_imports_id_user_id UNIQUE (id, user_id),
        CONSTRAINT ux_statement_imports_user_file_hash
          UNIQUE (user_id, file_hash),
        CONSTRAINT fk_statement_imports_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_statement_imports_file_hash_lowercase_sha256
          CHECK (file_hash ~ '^[0-9a-f]{64}$')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_statement_imports_user_statement_date
        ON statement_imports (user_id, statement_date)
    `);

    await queryRunner.query(`
      CREATE TABLE transactions (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        user_id BIGINT NOT NULL,
        category_id BIGINT,
        statement_import_id BIGINT,
        purchase_date DATE NOT NULL,
        description VARCHAR(500) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        category_match_confidence NUMERIC(5, 4),
        import_fingerprint CHAR(64),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_transactions PRIMARY KEY (id),
        CONSTRAINT fk_transactions_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_transactions_category_user
          FOREIGN KEY (category_id, user_id)
          REFERENCES categories (id, user_id)
          ON DELETE SET NULL (category_id),
        CONSTRAINT fk_transactions_statement_import_user
          FOREIGN KEY (statement_import_id, user_id)
          REFERENCES statement_imports (id, user_id)
          ON DELETE RESTRICT,
        CONSTRAINT ck_transactions_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_transactions_confidence_range CHECK (
          category_match_confidence IS NULL
          OR (
            category_match_confidence >= 0
            AND category_match_confidence <= 1
          )
        ),
        CONSTRAINT ck_transactions_import_fingerprint_lowercase_sha256
          CHECK (
            import_fingerprint IS NULL
            OR import_fingerprint ~ '^[0-9a-f]{64}$'
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_user_purchase_date
        ON transactions (user_id, purchase_date)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_user_category_purchase_date
        ON transactions (user_id, category_id, purchase_date)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_statement_import
        ON transactions (statement_import_id)
    `);
    await queryRunner.query(`
      CREATE INDEX ix_transactions_user_import_fingerprint
        ON transactions (user_id, import_fingerprint)
    `);

    await queryRunner.query(`
      CREATE TABLE category_rules (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        user_id BIGINT NOT NULL,
        category_id BIGINT NOT NULL,
        pattern VARCHAR(500) NOT NULL,
        normalized_pattern VARCHAR(500) NOT NULL,
        match_type VARCHAR(30) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_category_rules PRIMARY KEY (id),
        CONSTRAINT ux_category_rules_user_match_pattern
          UNIQUE (user_id, match_type, normalized_pattern),
        CONSTRAINT fk_category_rules_user FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_category_rules_category_user
          FOREIGN KEY (category_id, user_id)
          REFERENCES categories (id, user_id)
          ON DELETE CASCADE,
        CONSTRAINT ck_category_rules_match_type
          CHECK (match_type IN ('exact'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE category_rules');
    await queryRunner.query('DROP TABLE transactions');
    await queryRunner.query('DROP TABLE statement_imports');
    await queryRunner.query('DROP TABLE budgets');
    await queryRunner.query('DROP TABLE categories');
    await queryRunner.query('DROP TABLE users');
  }
}
