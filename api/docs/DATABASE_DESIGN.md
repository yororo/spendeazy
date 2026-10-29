# Database design

This describes the current API schema. [Migrations](../src/database/migrations/) define the authoritative constraints and indexes; [entities](../src/database/entities/) define TypeORM mappings. The accepted [mobile Expense contract](../../docs/specifications/mobile-expense-domain-api.md) also describes behavior beyond the currently implemented API surface.

## Relationships and ownership

| Table | Purpose and relationships |
| --- | --- |
| `users` | Local User linked to a unique Clerk identity. |
| `spaces` | Personal or Shared financial context with active/archived lifecycle. Personal Spaces have one private owner; Shared Space membership is created atomically when an Invite Code is accepted. |
| `space_memberships` | User access to a Space, with read or write capability. |
| `categories` | Space-owned classifications with optional description/color, a shared-catalog icon key, an aggregate configuration revision and active/inactive status. Names are unique per Space. |
| `budgets` | At most one monthly or yearly Budget per Category. Ownership derives through the Category. |
| `category_rules` | Space-owned Exact/Contains patterns related to a Category; normalized pattern and match type are unique per Space. |
| `statement_imports` | Committed Statement Import provenance with Space, immutable importer attribution, file hash, provider/account format, statement type/date or optional history bounds, and import timestamp. File hashes are indexed but not unique. |
| `statement_import_rows` | Immutable original row, included/excluded disposition and optional confirmed values; unique import/source-row identity and same-Space import/Category relationships. |
| `statement_import_operations` | Actor/Space/UUID identity, immutable protected request hash, pending/terminal state and immutable success result or safe failure metadata. No review payload. |
| `expenses` | Saved positive spending in a Space, with required Category, immutable Added By actor, date-only value, exact amount, revision, optional deletion timestamp, deleting actor and pre-delete revision, and nullable Statement Import/source-row links. A null import link identifies a manual Expense. Composite keys constrain Category and imported provenance to the same Space; source-row IDs are unique within an import. Legacy imports may retain a null source-row ID. |
| `expense_activities` | Append-only Expense create/edit/delete events with actor, UTC timestamp and before/after JSON snapshots. Snapshots retain Category IDs and editable values. Legacy Expenses may have no Activity. |
| `invitations` | Sender-owned Shared Space Invite Codes with protected lookup/display values, expiry and lifecycle state. |
| `invitation_claims` | Per-User saved invitation entries; claims do not reserve membership. |

Financial ownership is stored through `space_id`, not a User owner column. Actor IDs on Expenses, Activities and Statement Imports preserve attribution. Space authorization derives from authenticated membership. User- and Space-supplied IDs never grant access by themselves.

## Expense foundation migration

Migration `1960000000000-adopt-expense-foundation` renames `transactions` and `transaction_activities` to the canonical Expense tables and renames `purchase_date` to `expense_date`. It adds positive Expense revisions, makes Category required, removes the old category-match-confidence field, renames provider/account/history columns, allows nullable statement dates for e-wallet imports, and removes unique file-hash enforcement. Existing Activity snapshots have their date key renamed as well. Migration `1970000000000-expense-provenance-and-deletion-replay` adds immutable source-row provenance plus deleting actor/pre-delete revision metadata. Its checks permit legacy imported rows without fabricated row IDs and legacy deleted rows without invented actor metadata; new importer writes supply row IDs, and new deletion writes record replay metadata.

The migration stops with an actionable error if saved rows lack a Category. It does not guess a Category or rewrite financial classification. There is no requirement to preserve disposable development records. After adoption, Expense Category and Statement Import relationships are Space-scoped through composite foreign keys.

Historical migrations remain in place as schema history. They explain how Spaces, membership, legacy Transactions and duplicate detection were introduced; they are not the current table contract. The migration chain can still be applied to a fresh disposable database.

## Values and lifecycle

Database-generated `BIGINT` IDs are represented as positive decimal strings at application and HTTP boundaries. Expense amounts use exact `NUMERIC(15,2)` PHP values. Expense and statement-period dates use PostgreSQL `date`; timestamps use UTC `timestamptz` with millisecond precision. Expense mutations increment a bigint revision atomically.

Expense create/edit/delete and their Activity events are written in the same PostgreSQL transaction. Active lists and category summaries exclude deleted rows. Deleted Expenses remain available in authorized history. Both manual and imported Expenses are editable; imported provenance is immutable. Repeating a delete with the same actor and original pre-delete revision returns the retained row without another Activity event; all other stale revisions reject. A manual Expense has no import reference, and an imported Expense must reference a Statement Import in its Space.

Category deactivation preserves historical relationships. Existing Expenses may remain assigned to an inactive Category, while new assignment and reassignment require an active same-Space Category. Physical Category deletion is not part of the product workflow.

## Statement Imports

A Statement Import row represents committed provenance, not a temporary upload or review draft. Confirmation stores the Statement Import and all reviewed Expenses through the feature-owned transaction-bound unit of work. A failed write rolls back together. PDF bytes/passwords stay on device; the API receives JSON and a client-asserted SHA-256 file hash.

Exact file matches and Expense fingerprints are advisory duplicate signals, not uniqueness constraints. File hashes are nonunique after Expense foundation adoption, so an intentional reimport is possible. GCash reference identifiers are HMAC-protected before storage and are not returned.

Complete confirmations store parser/engine versions, original controls/reconciliation/diagnostics, page/completeness assertions, included/excluded counts, original Expense count/total and acknowledged warnings/digest. `imported_at` is the sole confirmation clock, exposed as `confirmedAt`. Original aggregate totals use unrestricted numeric storage rather than one Expense's numeric(15,2) ceiling. Legacy imports retain null complete provenance; migrations do not invent historical evidence.

New imported Expenses reference an included snapshot through snapshot/import/Space/source identity. Database constraints reject excluded snapshots and changed provenance. Editing or soft-deleting an Expense cannot mutate its snapshot or original import totals. Detail returns `confirmation` (null for legacy imports) and privacy-projected `rows`; history's `expenseCount` remains a current nondeleted count.

Operation identity is unique per authenticated actor, original Space and UUID, with at most one successful import per operation. Identity/hash and terminal state are immutable. A successful key remains retained with its import; identical replay returns the stored result even after Expense edits/deletion, Category changes or archive, subject to read authority and actor binding. Terminal failures store safe codes/details and, for review refresh, typed warning metadata. Pending does not imply failure. #154 owns status recovery/fencing and device receipt integration; #155 owns full history/detail presentation.

Personal physical cleanup removes Activity → Expenses → operations → imports (cascading snapshots) → Categories/Space/User. Shared retention continues preserving financial history. Financial execution, evidence, Activity, appended Rules/revisions and operation success use one transaction; admission persists no financial payload. Duplicate lookup includes retained deleted imported Expenses.

## Category Rules and reporting

The API stores Space-scoped Category Rules; matching remains on-device. Current Category summaries aggregate Expenses and Budgets. `POST /categories` and `PUT /categories/{categoryId}/configuration` save a Category, its optional Budget and its complete Rule set in one transaction under the Space write lock. Category revision advances once for a changed configuration; the Space Rule revision advances once only when the Rule set changes. Equivalent normalized Rule replacements retain existing Rule IDs and create no revisions. The full dashboard contract remains unimplemented. See [API architecture](../ARCHITECTURE.md) and [ADR 0004](../../docs/adr/0004-mobile-expense-domain-and-contract.md) for the implementation boundary.
