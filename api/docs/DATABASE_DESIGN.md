# Database design

This document explains the API's persistence model. [Root CONTEXT.md](../../CONTEXT.md) owns domain definitions; [ARCHITECTURE.md](../ARCHITECTURE.md) owns persistence boundaries and the unit of work. Paths below are relative to `api/`.

## Sources of truth

- `src/database/migrations/` defines the schema history, constraints, and indexes.
- `src/database/entities/` defines runtime TypeORM mappings.
- Feature application services enforce workflow invariants; presentation DTOs and generated `docs/openapi.json` describe the HTTP contract.

Read these files for exact columns, lengths, constraints, and transport validation instead of treating this overview as a second schema. Schema changes require explicit migrations.

## Relationships and ownership

| Table | Purpose and relationships |
| --- | --- |
| `users` | Local User linked to a unique Clerk identity; email uniqueness is case-insensitive. The optional active Shared Space reference is reserved for the shared-membership migration. |
| `spaces` | Personal or Shared financial context with active/archived lifecycle. Personal Spaces have one User as their private owner; Shared Space creation remains behind later invitation work. |
| `space_memberships` | User access to a Space, with `read` or `write` access. The Personal Space migration creates one writable membership per User. |
| `categories` | Space-associated classifications retaining a legacy User column during migration, with optional description and named color, plus active/inactive status. Names are unique per Space. |
| `budgets` | At most one monthly or yearly Budget per Category; ownership derives through the Category. |
| `statement_imports` | Committed Statement Import provenance associated with a Space while retaining a legacy User column, including provider/account-type metadata and a file hash unique per Space. `imported_by_user_id` preserves actor attribution. |
| `transactions` | Space-associated positive expenses retaining a legacy User column, with optional Category and Committed Statement Import relationships. `added_by_user_id` preserves actor attribution. |
| `category_rules` | Space-associated Exact/Contains patterns retaining the legacy User owner and Category relationship; normalized pattern and match type are unique per Space. |

Migration `1750000000000-introduce-personal-spaces` creates a Personal Space and writable membership for every existing User, backfills `space_id` on existing financial rows without changing their identifiers or values, and retains `user_id` for legacy callers. It also backfills immutable Transaction `added_by_user_id` and Statement Import `imported_by_user_id` from the legacy User without fabricating history. Later migrations scope names, Rule patterns, file hashes, and import fingerprints to a Space. Migration `1790000000000-remove-legacy-financial-reference-constraints` removes composite User foreign keys that prevented one Shared Space member from using another member's Category or Committed Statement Import; composite Space foreign keys remain authoritative. Migration `1800000000000-remove-legacy-financial-provisioning-triggers` removes the compatibility triggers and database provisioning function after application writes became explicitly Space-scoped and actor-attributed. The remaining legacy columns and User-scoped persistence methods still require retirement before the ownership migration is complete.

The reusable Space authorization boundary resolves accessible memberships from the authenticated local User; a client-supplied Space identifier is never an ownership grant. Read access and writable membership are represented separately so archived read-only history can be supported without exposing Shared Space creation yet.

Account in the web is derived from import provider/account-type metadata, or Cash for manual Transactions. There is no Account table. Existing `bank` and `card_type` columns represent provider and account type, including wallets; card/wallet identifiers and last-four digits are not stored as Account metadata. Imported descriptions may still contain identifiers present in the original statement.

## Values and lifecycle

IDs use database-generated `BIGINT` identities and are represented as strings in application records. Monetary amounts use `NUMERIC(15,2)` and normalized decimal strings across the API. Expenses and Budgets are positive and single-currency. Purchase/statement dates are date-only; timestamps are UTC `timestamptz` values.

Category deactivation preserves historical relationships and spending. Category Color is a nullable named palette identifier; the web resolves a stable fallback from Category ID for legacy/unselected colors. Renaming or deactivation retains the saved color. Default Categories are copied during Personal Space provisioning, not synchronized continuously from the catalog. Shared Space defaulting is reserved for the Shared Space acceptance migration.

Actual foreign-key delete behavior is defined in migrations: User references restrict deletion; Category deletion cascades to Budgets and Rules and clears only a Transaction's `category_id`; imported Transactions restrict deletion of their provenance. These database behaviors do not introduce a product workflow for physical Category or User deletion.

## Statement Import persistence

The web parses and reconciles the PDF and reviews Transactions before sending JSON. API `statement-imports` resources and `statement_imports` rows represent **Committed Statement Imports**, not temporary Upload/Categorize/Review state.

Commit saves provenance and the reviewed Transactions in one unit of work. All participating stores use the same transaction context; failure rolls back the operation. A manual Transaction has no `statement_import_id` or import fingerprint. An imported Transaction references its committed provenance. Category assignment is optional; automatic match confidence is nullable and bounded from 0 to 1. Manual and Unmapped assignments carry no confidence.

Exact File Duplicate detection uses `(space_id, file_hash)`. The web supplies the SHA-256 hash of the original file bytes; the API validates the asserted hash but does not receive or hash the PDF. File names are not duplicate identities. Provider/account type and statement date are not a unique statement key.

Probable Duplicate detection uses a non-unique fingerprint scoped to the Space. `src/statement-imports/application/import-fingerprint.ts` defines the versioned hash of normalized date, description, amount, provider, and account type. Keep this algorithm authoritative; matching fingerprints flag review, since legitimate expenses may share those values.

## Category Rules

The API stores and normalizes Rule patterns; the web evaluates matching and precedence during Statement Import. Keep matching policy with that workflow. [The Category Rule ADR](adr/0003-category-rule-storage-and-replacement.md) defines Space-scoped atomic replacement, retained identity, revision-based stale-edit rejection, and inactive-Category behavior. Legacy User-scoped routes remain compatibility shims for the authenticated User's Personal Space.
