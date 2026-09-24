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
| `users` | Local User linked to a unique Clerk identity; email uniqueness is case-insensitive. The optional active Shared Space reference supports lifecycle cleanup for active Shared Spaces. |
| `spaces` | Personal or Shared financial context with active/archived lifecycle. Personal Spaces have one User as their private owner; Shared Space creation and joining remain unavailable while Invite Codes replace email invitations. |
| `space_memberships` | User access to a Space, with `read` or `write` access. The Personal Space migration creates one writable membership per User. |
| `categories` | Space-owned classifications with optional description and named color, plus active/inactive status. Names are unique per Space. |
| `budgets` | At most one monthly or yearly Budget per Category; ownership derives through the Category. |
| `statement_imports` | Space-owned Committed Statement Import provenance, including provider/account-type metadata and a file hash unique per Space. The `(id, space_id)` key is the target of the imported Transaction provenance constraint. `imported_by_user_id` preserves actor attribution. |
| `transactions` | Space-owned positive expenses with optional Category and Committed Statement Import relationships. A non-null `statement_import_id` is constrained together with `space_id` to a Committed Statement Import in the same Space; `NULL` identifies a manual Transaction. `added_by_user_id` preserves actor attribution; nullable `deleted_at` retains deleted rows outside active spending. |
| `transaction_activities` | Append-only Transaction activity events. Creation and deletion events store the actor and UTC occurrence time; edit events also retain editable Transaction values before and after the edit. Legacy Transactions have no fabricated rows. The Transaction identifier is retained without a foreign key so deletion history remains inspectable. |
| `category_rules` | Space-owned Exact/Contains patterns related to a Category; normalized pattern and match type are unique per Space. |
| `invitations` | Sender-owned Shared Space Invite Codes with seven-day expiry, protected lookup and display representations, and one pending invitation per sender. Pending invitations do not reserve membership; rotation replaces the pending row atomically and revocation marks it unusable. |
| `invitation_claims` | Per-User saved incoming invitation entries. A unique invitation/User pair makes repeated code entry idempotent while allowing multiple Users to save the same active code. Rotation, revocation, and expiry delete claims in the same transaction as the lifecycle change. |

Migration `1750000000000-introduce-personal-spaces` creates a Personal Space and writable membership for every existing User and backfills `space_id` without changing financial identifiers or values. It also backfills immutable Transaction `added_by_user_id` and Statement Import `imported_by_user_id` without fabricating history. Later migrations scope names, Rule patterns, file hashes, and import fingerprints to a Space. Migration `1780000000000-scope-statement-import-duplicates-to-spaces` adds the composite foreign key that keeps each imported Transaction and its Committed Statement Import in one Space. Migrations `1790000000000-remove-legacy-financial-reference-constraints` and `1800000000000-remove-legacy-financial-provisioning-triggers` retire transitional constraints and provisioning triggers. Migration `1810000000000-remove-legacy-financial-user-ownership` removes the final financial `user_id` columns; application persistence interfaces are Space-only and actor columns remain for attribution. Migration `1880000000000-enforce-transaction-statement-import-space` validates existing imported provenance with an actionable diagnostic and adds the supporting composite index.

Migration `1850000000000-retain-deleted-transactions` adds nullable `transactions.deleted_at`, an index for retained-history pages, and the `deleted` Transaction activity type. Deleted rows remain available to authorized Space history and activity reads while active lists and spending aggregates exclude them.

The reusable Space authorization boundary resolves accessible memberships from the authenticated local User; a client-supplied Space identifier is never an ownership grant. Read access and writable membership are represented separately so archived read-only history can be supported while Shared Space creation and joining are unavailable.

Invite Codes are generated with high entropy and normalized only for harmless case/grouping differences at future code-entry boundaries. The database stores an HMAC lookup value and authenticated encryption ciphertext rather than the display code. The outgoing code is returned only from the authenticated sender's invitation response; it is never part of a URL or operational log. A partial unique index enforces one pending outgoing invitation per User even when creation requests race. Rotation, revocation, expiry, and claim creation lock the invitation row so a stale code cannot create a claim after its lifecycle changes commit.

An `invitation_claims` row records only that one authenticated User saved an invitation; it does not reserve membership or disclose the sender's code. Claim ownership is enforced by the `(invitation_id, user_id)` uniqueness boundary and by User-scoped delete operations. Declining deletes only that User's row, while deleting an invitation cascades its claims for later code rotation, revocation, and joining workflows.

Transaction creation, edit, and deletion activity are written in the same persistence transaction as the corresponding manual or imported Transaction mutation. Active lists and spending summaries filter `deleted_at IS NULL`; a retained-history read explicitly selects deleted rows. Activity reads are filtered by both Space and Transaction identifier. A missing activity row means the Transaction predates detailed history rollout; it does not change immutable `added_by_user_id` or imported provenance.

Account in the web is derived from import provider/account-type metadata, or Cash for manual Transactions. There is no Account table. Existing `bank` and `card_type` columns represent provider and account type, including wallets; card/wallet identifiers and last-four digits are not stored as Account metadata. Imported descriptions may still contain identifiers present in the original statement.

## Values and lifecycle

IDs use database-generated `BIGINT` identities and are represented as strings in application records. Monetary amounts use `NUMERIC(15,2)` and normalized decimal strings across the API. Expenses and Budgets are positive and single-currency. Purchase/statement dates are date-only; timestamps are UTC `timestamptz` values.

Category deactivation preserves historical relationships and spending. Category Color is a nullable named palette identifier; the web resolves a stable fallback from Category ID for legacy/unselected colors. Renaming or deactivation retains the saved color. Default Categories are copied during Personal Space provisioning, not synchronized continuously from the catalog. Shared Space defaulting is reserved for the future Invite Code membership flow.

Actual foreign-key delete behavior is defined in migrations: User references restrict deletion; Category deletion cascades to Budgets and Rules and clears only a Transaction's `category_id`; imported Transactions restrict deletion of their provenance and require `(statement_import_id, space_id)` to match `(id, space_id)` on the Committed Statement Import. These database behaviors do not introduce a product workflow for physical Category or User deletion.

## Statement Import persistence

The web parses and reconciles the PDF and reviews Transactions before sending JSON. API `statement-imports` resources and `statement_imports` rows represent **Committed Statement Imports**, not temporary Upload/Categorize/Review state.

Commit saves provenance and the reviewed Transactions in one unit of work. All participating stores use the same transaction context; failure rolls back the operation. A manual Transaction has no `statement_import_id` or import fingerprint. An imported Transaction references its committed provenance, and PostgreSQL enforces that the provenance and Transaction share the same Space. Category assignment is optional; automatic match confidence is nullable and bounded from 0 to 1. Manual and Unmapped assignments carry no confidence.

Exact File Duplicate detection uses `(space_id, file_hash)`. The web supplies the SHA-256 hash of the original file bytes; the API validates the asserted hash but does not receive or hash the PDF. File names are not duplicate identities. Provider/account type and statement date are not a unique statement key.

Probable Duplicate detection uses a non-unique fingerprint scoped to the Space. `src/statement-imports/application/import-fingerprint.ts` defines the versioned hash of normalized date, description, amount, provider, and account type. Keep this algorithm authoritative; matching fingerprints flag review, since legitimate expenses may share those values.

## Category Rules

The API stores and normalizes Rule patterns; the web evaluates matching and precedence during Statement Import. Keep matching policy with that workflow. [The Category Rule ADR](adr/0003-category-rule-storage-and-replacement.md) defines Space-scoped atomic replacement, retained identity, revision-based stale-edit rejection, and inactive-Category behavior. Legacy User-scoped routes remain compatibility shims for the authenticated User's Personal Space.
