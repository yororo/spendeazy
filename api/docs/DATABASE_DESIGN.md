# Database design

This describes the current API schema. [Migrations](../src/database/migrations/) define the authoritative constraints and indexes; [entities](../src/database/entities/) define TypeORM mappings. The accepted [mobile Expense contract](../../docs/specifications/mobile-expense-domain-api.md) includes additional behavior and storage that is not implemented yet.

## Relationships and ownership

| Table | Purpose and relationships |
| --- | --- |
| `users` | Local User linked to a unique Clerk identity. |
| `spaces` | Personal or Shared financial context with active/archived lifecycle. Personal Spaces have one private owner; Shared Space membership is created atomically when an Invite Code is accepted. |
| `space_memberships` | User access to a Space, with read or write capability. |
| `categories` | Space-owned classifications with optional description/color and active/inactive status. Names are unique per Space. |
| `budgets` | At most one monthly or yearly Budget per Category. Ownership derives through the Category. |
| `category_rules` | Space-owned Exact/Contains patterns related to a Category; normalized pattern and match type are unique per Space. |
| `statement_imports` | Committed Statement Import provenance with Space, immutable importer attribution, file hash, provider/account format, statement type/date or optional history bounds, and import timestamp. File hashes are indexed but not unique. |
| `expenses` | Saved positive spending in a Space, with required Category, immutable Added By actor, date-only value, exact amount, revision, optional deletion timestamp, and nullable Statement Import link. A null link identifies a manual Expense. Composite keys constrain Category and imported provenance to the same Space. |
| `expense_activities` | Append-only Expense create/edit/delete events with actor, UTC timestamp and before/after JSON snapshots. Snapshots retain Category IDs and editable values. Legacy Expenses may have no Activity. |
| `invitations` | Sender-owned Shared Space Invite Codes with protected lookup/display values, expiry and lifecycle state. |
| `invitation_claims` | Per-User saved invitation entries; claims do not reserve membership. |

Financial ownership is stored through `space_id`, not a User owner column. Actor IDs on Expenses, Activities and Statement Imports preserve attribution. Space authorization derives from authenticated membership. User- and Space-supplied IDs never grant access by themselves.

## Expense foundation migration

Migration `1960000000000-adopt-expense-foundation` renames `transactions` and `transaction_activities` to the canonical Expense tables and renames `purchase_date` to `expense_date`. It adds positive Expense revisions, makes Category required, removes the old category-match-confidence field, renames provider/account/history columns, allows nullable statement dates for e-wallet imports, and removes unique file-hash enforcement. Existing Activity snapshots have their date key renamed as well.

The migration stops with an actionable error if saved rows lack a Category. It does not guess a Category or rewrite financial classification. There is no requirement to preserve disposable development records. After adoption, Expense Category and Statement Import relationships are Space-scoped through composite foreign keys.

Historical migrations remain in place as schema history. They explain how Spaces, membership, legacy Transactions and duplicate detection were introduced; they are not the current table contract. The migration chain can still be applied to a fresh disposable database.

## Values and lifecycle

Database-generated `BIGINT` IDs are represented as positive decimal strings at application and HTTP boundaries. Expense amounts use exact `NUMERIC(15,2)` PHP values. Expense and statement-period dates use PostgreSQL `date`; timestamps use UTC `timestamptz` with millisecond precision. Expense mutations increment a bigint revision atomically.

Expense create/edit/delete and their Activity events are written in the same PostgreSQL transaction. Active lists and category summaries exclude deleted rows. Deleted Expenses remain available in authorized history. Both manual and imported Expenses are editable; imported provenance is immutable. A manual Expense has no import reference, and an imported Expense must reference a Statement Import in its Space.

Category deactivation preserves historical relationships. Existing Expenses may remain assigned to an inactive Category, while new assignment and reassignment require an active same-Space Category. Physical Category deletion is not part of the product workflow.

## Statement Imports

A Statement Import row represents committed provenance, not a temporary upload or review draft. Confirmation stores the Statement Import and all reviewed Expenses through the feature-owned transaction-bound unit of work. A failed write rolls back together. PDF bytes/passwords stay on device; the API receives JSON and a client-asserted SHA-256 file hash.

Exact file matches and Expense fingerprints are advisory duplicate signals, not uniqueness constraints. File hashes are nonunique after Expense foundation adoption, so an intentional reimport is possible. GCash reference identifiers are HMAC-protected before storage and are not returned.

The current schema stores committed import metadata and linked Expenses. Durable confirmation operation recovery, complete immutable row/evidence snapshots, and original-versus-current import projections remain part of the broader accepted contract, not this implemented foundation.

## Category Rules and reporting

The API stores Space-scoped Category Rules; matching remains on-device. Current Category summaries aggregate Expenses and budgets. Atomic whole-Category configuration, icon-key configuration, aggregate revisions and the full dashboard contract are not yet implemented. See [API architecture](../ARCHITECTURE.md) and [ADR 0004](../../docs/adr/0004-mobile-expense-domain-and-contract.md) for the implementation boundary.
