# Expense domain and mobile API contract

Status: accepted target specification, 2026-10-24. This document plans the mobile replacement; it does not implement endpoints, change generated OpenAPI, reset data, or claim device validation. The decision record is [Specify the target Expense domain and mobile API contract](https://github.com/yororo/spendeazy/issues/132), under [Chart the Spendeazy mobile replacement specification](https://github.com/yororo/spendeazy/issues/124).

## Authority and boundaries

Required product inputs are the approved [screen flows](https://github.com/yororo/spendeazy/issues/127#issuecomment-6338502235), [reporting calculations](https://github.com/yororo/spendeazy/issues/128#issuecomment-6339633472), [Transaction review and confirmation](https://github.com/yororo/spendeazy/issues/131#issuecomment-6341770311), and [parser decision](https://github.com/yororo/spendeazy/issues/130#issuecomment-6352478040). Their full decisions remain in those tickets; the contracts below carry their behavior. The root [glossary](../../GLOSSARY.md) owns domain terms. The mobile glossary redirects to it.

- Mobile owns PDF selection/unlocking/extraction, classification, reconciliation, Exact/Contains matching, reviewed values, exclusions, remembered-rule drafts and navigation. All extraction and matching are on-device. No PDF/password upload, server parser, remote Category Suggestions, PayPal or CSV.
- The approved extraction baseline is bundled PDF.js in a restricted local WebView using engine stream order, separate from provider interpretation, advisory reconciliation and Category Rules. Image-only PDFs require a text-based statement; no OCR. Mixed-page completeness warnings must not present partial extraction as verified complete. GCash direction uses statement evidence, not the proof's description heuristic. Measured limits, older-device/OS/WebView floors and termination-file cleanup remain in the approved prelaunch validation follow-up.
- The API owns identity-to-User resolution, authorized Space access, persistence, save-time validation, duplicate lookup, reporting and atomic confirmation. Client evidence is an assertion, not bank-verified truth. The API does not re-run extraction or Category matching.
- Saved positive spending is Expense. Parsed statement activity is Transaction, including payments and credits that never become Expenses. Statement Entry is not target vocabulary. Technical database transactions keep that name.
- This is an intentional breaking development contract: no old-name routes, JSON aliases, Personal financial aliases, compatibility adapters, data-preservation migration obligation or old-client coexistence. `web/` remains untouched and its eventual cutover is separate.
- Retain the modular monolith, feature-owned persistence ports and transaction-bound units of work. Extend real atomic boundaries; do not introduce a second parser/matcher on the API or a generic repository framework.

## Representations and common behavior

| Value | Target representation |
| --- | --- |
| Persistent identifiers | Positive bigint decimal JSON strings, as in `"42"`; no lossy JavaScript numbers. |
| Import operation identifier | Client-generated UUID, scoped to authenticated User and original Space. It is not a file hash. |
| Expense and Budget amounts | PHP-only positive decimal strings with exactly two fractional digits, up to 13 integer digits; PostgreSQL `numeric(15,2)`. Reject excess precision, zero and negative values; do not silently round input. Forms may normalize `4.5` to `"4.50"` before submission. |
| Expense dates | Valid Gregorian `YYYY-MM-DD`, stored as `date`; no timezone conversion. The API rejects dates after today in Asia/Manila for both manual and imported Expenses. |
| Event timestamps | UTC RFC 3339 timestamps with millisecond precision. Manila determines date buckets and today, independent of device timezone. |
| Revisions | Opaque decimal revision strings, incremented atomically; equality is the only client operation. Distinct from timestamps and historical Budget versions; they retain no prior configuration. |
| Names and descriptions | Trimmed, nonblank; Expense description 1–500 characters. Category name 1–100 characters, unique case-insensitively per Space, including inactive Categories. Rule pattern 1–500 characters after whitespace normalization. |
| Page size | Default 20, minimum 1, maximum 100; opaque cursor bound to the complete filter/sort selection, excluding page size. |

Use exact decimal/integer-cent arithmetic for saved money. Planning uses rational arithmetic so a Yearly amount divided by 12 is never rounded before aggregation. Amount aggregates are not constrained by one record's 13-digit limit. Display final money half-up to two decimals and percentages half-up to one decimal; status and sorting use exact values. Return rational planning quantities as `{numerator: "…", denominator: "…"}` in **PHP**, with a positive denominator, plus final display values where specified. Percentage with zero denominator is `null`.

Require JSON and reject unknown request fields. Preserve the existing common error envelope and request correlation. Error details identify JSON field paths and permitted conflict information, never another Space's data. Use 400 for malformed fields/cursors; 401 for invalid sessions; 404 for inaccessible/missing scoped resources; 409 for archived writes, stale revisions, Category eligibility, rule conflicts or changed import review; 413 for the existing 1 MiB request body limit. Do not split an oversized import into independently committing chunks: retain review and explain the failure. Verify full original-evidence payloads against supported fixtures at the acceptance gate; an exceeded limit requires an explicit follow-up decision, not partial confirmation.

Keep the wire envelope `{error: {code, message, details}}`. Retain `VALIDATION_FAILED`, `UNAUTHENTICATED`, `SPACE_NOT_FOUND`, `SPACE_NOT_WRITABLE`, `STALE_EDIT`, `CATEGORY_NOT_FOUND`, `CATEGORY_INACTIVE`, `CATEGORY_NAME_ALREADY_EXISTS`, and `CATEGORY_RULE_PATTERN_ALREADY_EXISTS` where applicable. Rename saved-record lookup failure to `EXPENSE_NOT_FOUND`; retire `IMPORTED_TRANSACTION_IMMUTABLE` because both sources are editable. Add `IMPORT_REVIEW_REQUIRED` and `IMPORT_OPERATION_PAYLOAD_CONFLICT` for the new protocol. Details use JSON Pointers into target fields (such as `/expenses/0/categoryId`, `/expectedRevision`), and review conflicts return refreshed warning metadata in a typed error detail. No old Transaction IDs/count fields survive in errors.

## Domain and persistence

### Expense, Activity and original provenance

An Expense belongs to one Space and has `id`, `expenseDate`, `description`, `amount`, required `categoryId`, immutable `addedByUserId`, `source: manual|imported`, `createdAt`, `updatedAt`, `revision`, and nullable `deletedAt`. An imported Expense also has immutable `statementImportId` and `sourceRowId`. These references, the Category and its Space must agree through composite database constraints. A manual Expense has neither import reference. No separate Account entity is introduced: manual means Cash; imported Account is derived from provider and account format.

Both members of an active Shared Space and a Personal Space's User may create, read, edit and delete manual and imported Expenses identically. Read detail supports both sources, including deleted records for authorized history inspection. Editable values are amount, description, date and Category; source, Space, original actor, import link and extracted evidence cannot be patched.

Creating or reassigning requires an active Category in the same Space. An existing Expense may retain its inactive Category when another field is corrected; resending that unchanged Category is allowed. Inactive is not nullable. Categories without Budgets are valid. No launch path creates Uncategorized Expenses, and no legacy nullable-Category backfill is required.

Create/edit/delete writes an append-only Expense Activity event in the same database transaction. Events carry `id`, `expenseId`, `spaceId`, `type: created|edited|deleted`, `actorUserId`, `occurredAt`, and before/after financial snapshots (null on the absent side of creation). Deletion retains the final values for inspection. Snapshots contain date, amount, description and Category **ID**, not frozen Category names/colors. Resolve all Category labels to their current name/color. Actor identity and Added By remain immutable references, displayed with the person's current name/photo or Deleted user. A rename is not an Expense edit and does not fabricate Activity.

Deletion is retained history, not physical removal: exclude it from active lists, actual totals and current import totals; retain its original import evidence and Activity. DELETE requires the current revision. Persist the deleting actor and pre-delete revision: repeating that actor's original deletion precondition returns the retained deleted state, without duplicate events; other stale revisions reject. There is no restore endpoint, whole-import deletion or general Space Activity feed at launch; Activity is per Expense and Deleted Expenses has its own list.

### Category, Budget and Rules as one editor draft

Categories belong to a Space, with required name, predefined `iconKey`, allowlisted `colorKey`, `isActive` and a revision. The mobile implementation owns an explicit shared icon/color catalog, mapped to the accepted token/design reference; the API validates keys from that same catalog. There is at most one current Budget per Category: positive `amount`, `currency: PHP`, `recurrence: monthly|yearly`. `budget: null` explicitly removes it. There are no Budget versions, effective dates, recurrence-transition histories or rollover.

Category settings can be maintained while inactive, including setting/removing a Budget and adding/editing/removing Rules. They remain excluded from new assignments, matching, planning and Budget checks until reactivation. Deactivation preserves historical Expenses, Budget and Rules and requires confirmation in mobile. No hard Category deletion is exposed. Renaming retains identity/color; a name conflicting with an inactive Category is still a conflict.

`POST /categories` and `PUT /categories/{categoryId}/configuration` save name/icon/color/status, optional Budget and complete Rules for **that Category** as one transaction. A category-configuration read returns its revision and the Space Rule collection revision. A replacement supplies `expectedRevision` and, when Rules change, `expectedRulesRevision`; stale changes reject the entire save. A new Category uses `expectedRevision: null` and still supplies the Rule revision when creating Rules. Omitted fields are not a partial-save convention: this command always supplies the complete draft, including `budget: null` and `rules: []` when intentionally empty. Other Categories' Rules remain unchanged.

Keep a unique `(space_id, normalized_pattern, match_type)` Rule key across active and inactive Categories. Identical normalized key and Category is a no-op retaining Rule identity; conflicting Category returns `CATEGORY_RULE_PATTERN_ALREADY_EXISTS` with its authorized Category and proposed field path. Never silently steal or replace another Category's Rule. Overlapping but different patterns remain permitted: Exact precedence and distinct-Category ambiguity are evaluated locally. Retained Rule identities are stable across equivalent replacements. A successful mutation increments the Category revision and, if Rules actually changed, the Space Rule revision once. A no-op does not manufacture revisions.

Import draft remembered Rules use the same invariants and participate in confirmation's transaction. Advance each affected Category configuration revision once and the Space Rule revision once for the changed batch; identical same-Category Rules advance neither. A conflicting remembered Rule rejects the entire confirmation and retains the draft. The User may remove the proposed Rule or resolve the configuration conflict and reconfirm. An unrelated Rule change does not invalidate reviewed Category assignments or require rematching; validate only the proposed Rule identities/conflicts and current Category eligibility under the Space lock.

## Endpoint surface

All financial routes below use prefix `S = /api/v1/users/me/spaces/{spaceId}`. Personal, active Shared and archived Shared reads use the same explicit Space routes. Retain User-scoped `/users/me`, the Space catalog/leave routes and Invite Code lifecycle; they are not Personal financial aliases.

| Method and path under S | Contract |
| --- | --- |
| `GET /expenses` | Active Expenses, filters/sort/cursor, full-filter `totalCount` and exact `totalAmount`, plus `nextCursor`. |
| `POST /expenses` | Manual Expense create: date, description, amount, Category. Returns 201, Expense and Location. Server supplies actor/Space. |
| `GET /expenses/deleted` | Retained deleted Expenses, same financial filters; sorted `deletedAt` descending then ID descending. Totals refer only to this deleted selection, clearly labelled. |
| `GET /expenses/{expenseId}` | Manual/imported active or deleted detail, revision, Added By and immutable provenance reference. |
| `PATCH /expenses/{expenseId}` | Editable fields plus required `expectedRevision`; returns updated Expense. A deleted record rejects editing. |
| `DELETE /expenses/{expenseId}` | Required `If-Match` revision; returns retained deleted Expense including new revision; no restoration. |
| `GET /expenses/{expenseId}/activity` | Authorized append-only event page, ordered occurrence time then event ID ascending. |
| `GET /categories` | Active or inactive selection, name search, recurrence/unset filters and name/amount sort; returns configurations needed by Budget and local matching. |
| `GET /categories/{categoryId}/configuration` | Category, optional Budget, its Rules, Category revision and Space Rule revision. |
| `POST /categories` | Complete new configuration, atomic Category/Budget/Rules creation. |
| `PUT /categories/{categoryId}/configuration` | Complete atomic editor replacement; no separate mobile Budget or Rule writes. |
| `GET /category-rules` | Space Rules and `rulesRevision` for on-device evaluation; includes Category identity/active status. |
| `GET /reporting/dashboard` | Canonical Monthly/Yearly aggregates and exact plans described below. |
| `GET /reporting/budget-plan` | All-active-Category monthly/annual equivalents and Budget count, independent of Budget list search/filter. |
| `POST /statement-import-previews` | Stateless reviewed JSON validation and duplicate warnings; no persisted review draft, PDF extraction or category matching. |
| `PUT /statement-import-operations/{operationId}` | Submit one immutable confirmation payload idempotently. |
| `GET /statement-import-operations/{operationId}` | Same-User/original-Space recovery status; works for committed results in an archive with read permission. |
| `GET /statement-imports` | Successful imports, confirmation-date filters, newest-confirmed-first cursor, original/current counts and totals. |
| `GET /statement-imports/{statementImportId}` | Immutable provenance/evidence/confirmation summary plus current Expense summary. |

The Expense collection accepts `fromDate`, `toDate` (inclusive), `categoryId`, `description` (trimmed case-insensitive substring), `statementImportId`, `source`, `sort: newest|oldest`, `pageSize`, `cursor`. Newest orders `expenseDate DESC, id DESC`; oldest reverses both. Default newest. Date bounds need not be whole months: Dashboard drill-through uses arbitrary inclusive ranges. Totals ignore cursor/page size and match all other filters. Add the selected `statementImportId` when opening an import's Expenses, including the deleted view for deletion history. No client traversal of all pages to calculate totals. Remove `categoryState=uncategorized` and the old bank/card filter aliases; launch does not require these controls.

Cursor and summary reads use a consistent query snapshot for that response. Pages are live data, not a multi-request frozen ledger: refresh resets the cursor and totals after a save, focus or pull-to-refresh. Reject a cursor reused with another Space, filter or sort. State restoration in mobile preserves selections/scroll on detail Back; switching Spaces clears financial selections.

The Category list accepts `state: active|inactive`, `recurrence: all|monthly|yearly|unset`, `search`, `sort: name_asc|name_desc|amount_asc|amount_desc`. Amount compares exact monthly equivalents, unset last in either direction; ties use Category name then ID. Display the original recurrence/amount. Inactive configurations remain visible only in their separate selection. Name comparison uses case-insensitive deterministic order, then ID for stability.

All actor projections include `{id, name, photoUrl, isDeleted}` without exposing email in financial history. Category projections include `{id, name, iconKey, colorKey, isActive}`. Responses distinguish `expenseCount`, `expenseTotal`, `expenses` and `expenseId`; do not emit parallel Transaction fields.

## Reporting contract

`GET /reporting/dashboard?view=monthly&endMonth=YYYY-MM` returns exactly six calendar months ending at `endMonth`, defaulting to the last complete month. Reject a future end month. A deliberately selected current month ends today and is `inProgress`. `view=yearly&year=YYYY` defaults to the current Manila year; reject future years. Past years span the full year; current year ends today. Return resolved `fromDate`, `toDate`, `today`, `timezone: Asia/Manila`, `currency: PHP`, `configurationBasis: current` and one `asOf` timestamp.

One response contains summary actual Expense amount/count, exact and display Planned, exact difference/percentage plus above/below/equal/no-plan state, highest Category, successful import count/latest confirmation, monthly Expense points, Category points, and per-Category Budget checks. Return the exact date/Category filters for each Expenses drill-through. Optional repeated `chartCategoryId` query values select only Category chart points, never summary/planning/import counts. Expense totals include active and inactive Category history, manual/imported and unbudgeted Expenses, excluding deleted Expenses.

- Monthly-equivalent plan = current active Monthly Budgets + current active Yearly Budgets / 12. Annual equivalent is exactly 12 times that value. Budget-plan totals and count ignore list filters/search.
- Six-month Planned counts six full months even when the current month is incomplete. Yearly Planned counts started months (12 in a past year). No daily proration.
- Difference = actual minus exact Planned. Percentage = absolute difference / Planned × 100. With zero Planned, return `no_plan` and null percentage/remaining comparison; actual Expenses remain available.
- Highest Category is greatest actual total in the range, ties by current Category name then ID; with zero Expenses, return null. Inactive Categories participate through actual Expenses.
- Monthly checks compare the current Monthly limit to each completed calendar month's actual Expenses. Return breach count and eligible completed-month count in the selected window/year. Exclude the in-progress month. With no eligible months, count/denominator are zero and the UI shows a dash.
- Yearly checks compare actual Expenses for the selected calendar year to the **full** current Yearly limit, including on Monthly Dashboard. Monthly windows may span two years: return separate `{year, usageFromDate, usageToDate, actual, limit, status}` Yearly checks for each represented year, never compare a cross-year sum to one annual limit. Future months in the current year add no Expenses. No Yearly monthly breach count or time-based pacing.
- Status is normal below 80%, nearing at 80% through below 100%, at limit at exactly 100%, over above 100%, calculated exactly. Only current active Category Budgets participate in checks, including for retrospective ranges.
- Category monthly charts use actual Monthly limits where applicable; Yearly Categories retain full annual context and do not plot annual/12 as a cap. Monthly plan comparison lines are explicitly planning equivalents.
- Import count filters `confirmedAt` using Manila midnight-inclusive/date-end-exclusive timestamp boundaries, not statement dates. Current and original import Expense totals are distinct from this count.

The API computes these financial aggregates; mobile formats them and draws the accepted screens. Do not round each month's 1,000/year contribution to 83.33 before calculating six-month Planned of 500.00 or annual 1,000.00. No Budget configuration history is created by generating a retrospective report.

## Import preview, confirmation and recovery

### Payload and evidence

The preview and confirmation share a canonical payload:

```json
{
  "statement": {
    "fileName": "statement.pdf", "fileHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "provider": "bdo", "accountFormat": "amex", "statementType": "credit_card",
    "statementDate": "2026-09-30", "historyFromDate": null, "historyToDate": null
  },
  "evidence": {
    "parserVersion": "example-v1", "extractionEngineVersion": "example-v1",
    "transactions": [
      {"sourceRowId": "row-1", "original": {"dateText": "2026-09-10", "description": "Coffee", "amountText": "100.00"}, "normalized": {"date": "2026-09-10", "amount": "100.00"}, "classification": "purchase", "matchingSource": "manual"}
    ],
    "controlTotals": [{"key": "debits", "label": "Total debits", "amount": "100.00"}],
    "reconciliation": {"status": "matched", "comparisons": [{"controlKey": "debits", "extractedAmount": "100.00", "difference": "0.00"}], "diagnostics": []}
  },
  "expenses": [
    {"sourceRowId": "row-1", "expenseDate": "2026-09-10", "description": "Coffee", "amount": "100.00", "categoryId": "42"}
  ],
  "excluded": [],
  "rememberedRules": [],
  "acknowledgedWarnings": [], "acknowledgedWarningDigest": null
}
```

This fictional preview example asserts a one-row statement, not a real PDF/hash or engine validation result. Supported combinations are `bdo/amex/credit_card`, `eastwest/visa/credit_card`, `gcash/wallet/e_wallet`. Provider/account-format keys replace `bank`/`cardType`, without aliases. Credit Card requires a valid `statementDate` and null history bounds. E-Wallet requires inclusive valid `historyFromDate`/`historyToDate` with start no later than end, and null `statementDate`; do not overload its history end as a statement date. These metadata fields never change an Expense date or confirmation timestamp.

Evidence Transactions have unique import-local `sourceRowId`, original extracted date/description/amount text, normalized date/amount when available, classification (`purchase|outgoing_transfer|payment|refund|credit|cash_in`), and local matching source (`manual|exact|contains|unmapped`). Preserve invalid original text separately from corrected valid values. Retain original control totals, discrepancy values and parser diagnostics needed to explain reconciliation. Do not upload full extracted PDF text, passwords, PDF bytes or full card/wallet identifiers. Duplicate-reference input is hashed with the existing Space-scoped HMAC before storage and omitted from returned evidence. Do not put raw reference identifiers in original-evidence snapshots.

Each original row appears exactly once in `expenses` or `excluded`; the API validates row identity, disposition and eligible classification without parsing or matching. Each included row becomes exactly one Expense with required active Category and valid positive/date-bounded fields. Automatically excluded payment/refund/credit/cash-in classifications cannot be included; an excluded eligible purchase/transfer may be restored locally. `excluded` retains `sourceRowId`, reason and whether exclusion was automatic or manual. Require at least one Expense. Zero-row/empty confirmation is invalid.

Remembered Rules contain pattern, match type and Category ID, not new Category definitions. Their Categories must be active in the destination at save time. Original evidence and confirmed values are immutable once committed, even when current Expenses change. Both are client-asserted and are not proof that a parser's direction detection was correct; device parser conformance remains a separate gate.

The target DTO field shapes are explicit:

| Field | Shape |
| --- | --- |
| `evidence.transactions[]` | `{sourceRowId, original: {dateText, description, amountText}, normalized: {date, amount}, classification, matchingSource, duplicateReference?}`. The three original values are strings; normalized date/amount may be null when extraction is invalid. Normalized amount is a signed two-decimal string using the parser's documented convention, not a saved Expense amount. `sourceRowId` is nonblank and unique within the import. Optional `duplicateReference` is an ephemeral 1–100 character string hashed before persistence and removed from stored/returned evidence. |
| `evidence.controlTotals` | Array of `{key, label, amount}` with unique keys, nonblank labels and signed exact two-decimal amounts, preserving the statement's original controls. An unsupported/absent control is omitted, never invented as zero. |
| `evidence.reconciliation` | `{status: matched|warning|unavailable, comparisons: [{controlKey, extractedAmount, difference}], diagnostics: [{code, message}]}`. `difference` is extracted minus control, using exact two-decimal strings. `unavailable` is a visible warning, not silent reconciliation success. These are original local extraction results, never recomputed from edited Expenses. |
| `excluded[]` | `{sourceRowId, reason, automatic}` with a nonblank reason and boolean flag; references original evidence rows. |
| `rememberedRules[]` | `{pattern, matchType: exact|contains, categoryId}` with the same field validation/normalization as the configuration command. |
| Preview warnings | `{id, type: reconciliation|exact_file|probable_duplicate, sourceRowIds, expenseIds, statementImportIds, message}`. IDs/digest are stable for the same reviewed content and warning set; referenced persisted IDs must be visible in the destination Space. Empty reference arrays are allowed. |

DTOs enforce configured body-size bounds, unique row IDs, valid references and one disposition per original row before any financial write. Category matching source is evidence rather than a probability claim; the target does not retain a fabricated numeric confidence on Expenses.

### Warnings and atomic commit

Preview returns `{warnings, warningDigest}` for exact-file matches, probable-duplicate row/Expense references and original local reconciliation warnings. `warningDigest` is bound to the normalized reviewed content, destination and sorted warning set, excluding acknowledgment fields to avoid a circular hash. The operation's separate immutable **request hash** includes that content plus submitted acknowledgment IDs/digest. Preview persists no financial data or review draft. The API performs Space-scoped file/fingerprint/reference lookups but not financial extraction/matching. Include retained deleted imported Expenses in duplicate signals since deleting spending does not erase evidence that it was imported.

One explicit Import anyway action submits the displayed digest in `acknowledgedWarningDigest` and its IDs in `acknowledgedWarnings` (null/empty when no warnings). Warnings are advisory, including reconciliation mismatch, identical file bytes and probable duplicates; they cannot bypass invalid amount/date/Category, archived membership or Rule conflicts. Confirmation rechecks under the Space lock. New or changed warnings return `IMPORT_REVIEW_REQUIRED` with refreshed warnings and save nothing, allowing review/acknowledgment and a new logical submission. Never silently remove matched rows. Hash equality is not a unique constraint; intentional reimports have separate operation IDs, import records and Expenses.

Within one transaction: lock/validate the operation and writable membership, resolve current Categories/Rules and duplicate warnings, persist Committed Statement Import plus all immutable evidence/confirmed rows, Expenses and creation Activity, remembered Rules/revisions, and the successful operation result. A failure leaves none of those financial writes partially committed. Use the same Space lock order as leave/archive/configuration commands so a race has one outcome: a complete commit preceding archival, or no financial write and a clear conflict.

### Operation protocol

1. Generate `operationId` when the reviewed confirmation payload is frozen. Write a small device receipt `{userId, spaceId, operationId}` **before** sending. Do not store PDF, password, reviewed rows, Rules or financial values in this receipt.
2. `PUT /statement-import-operations/{operationId}` binds the operation to the authenticated actor, Space and canonical request hash (including acknowledgment fields). The server may persist minimal operation metadata (`pending`, request hash and processing ownership) before the financial transaction; this is not a persisted review draft. Store no uncommitted payload for automatic replay.
3. First successful execution returns 201 and `{status: committed, operationId, statementImportId, confirmedAt, originalExpenseCount, originalExpenseTotal}`. Same actor/Space/ID/hash returns the same immutable success with 200, even after Expenses are edited/deleted or the Space becomes archived. Authorize read access before replay; never require current Category eligibility to replay an already committed result.
4. Same actor/Space/ID with changed payload returns `IMPORT_OPERATION_PAYLOAD_CONFLICT` (409). Simultaneous identical requests serialize; only one can create financial rows. An operation in progress may return 202 and a status location; never start a second commit blindly. User/Space mismatch cannot expose another actor's receipt/result.
5. `GET` returns `{status: pending|committed|not_committed, ...}` for a known operation. A definitive `not_committed` includes a stable error/review code and guarantees that operation can no longer commit. A pending lease timeout alone is **not** that guarantee: recovery must acquire the operation lock and fence any former processor before declaring it terminal. The committed result and financial writes share the transaction. Crash/response-loss tests must prove this boundary.
6. Unknown IDs return 404, meaning no operation is currently known, not proof that an earlier delayed request can never arrive. Pending/unknown status is not success or failure and cannot authorize a new independent import. Retry a living frozen payload with the **same ID**; the server safely resolves/resumes it under the lock. No automatic resubmission on app restart.
7. After definitive failure and user correction, create a new operation ID; prior terminal IDs return their terminal result and cannot be reused with edited content. Intentional reimport also uses a new ID and the warning flow. Retain successful operation keys/results for the import's lifetime and terminal failure metadata until User deletion; no expiration that turns a committed retry into a new import.
8. On restart while signed in as the same User, check the receipt against the original Space. Show the original success, definitive failure, or an honest pending/unknown state; lost review data cannot be reconstructed from the receipt. Acknowledge a terminal result to remove the receipt. Explicit dismissal of an unresolved receipt warns that saving may still complete; history remains the place to inspect successes.
9. **Ordinary sign-out clears the receipt**, local financial caches and living drafts; it does not survive for a later sign-in. This declines the proposed cross-sign-out retention. Account deletion also clears it. Session expiry without explicit sign-out keeps a living draft/receipt inaccessible until the same User reauthenticates; a different User clears the prior draft/receipt. Receipt handling never changes the submitted destination.

### Completed-import projections

`statement_imports` is successful provenance only; operation rows are distinct. Persist immutable `confirmedAt`, importer, original metadata/evidence, acknowledged warnings, confirmed included/excluded counts and confirmed Expense values, `originalExpenseCount`, `originalExpenseTotal`. Reference original rows through stable `sourceRowId` and enforce uniqueness per import. Do not derive original totals from mutable Expense rows.

Return `currentExpenseCount`, `currentExpenseTotal` (non-deleted associated Expenses), `editedExpenseCount` (associated Expenses with an edit event, including later-deleted ones), and `deletedExpenseCount` (currently deleted). An Expense edited twice counts once; reverting an edit still counts as edited. Edited/deleted counts can overlap and must not be added as mutually exclusive partitions. Original controls, original extracted row amounts and saved-at-confirmation totals are three separate quantities.

History sorts `confirmedAt DESC, id DESC` and filters the selected confirmation-date range in Manila. Retain statement-date/history-period metadata for detail, not as the history filter clock. Detail links to active/deleted Expense selections; updating an Expense never changes its importer, source row, original totals or import count. Import operation status is visible only to its original User; an authorized other member can inspect the resulting import normally.

### Target storage additions

| Storage | Required shape and constraints |
| --- | --- |
| `expenses` / `expense_activities` | Same-Space Category/import references, required actor references, exact amount/date fields, Expense revision and retained deletion; Activity stores immutable financial snapshots with Category IDs. |
| `categories` / `budgets` / `category_rules` | Category icon/color keys and aggregate revision; one current Budget per Category; Rules unique by Space/normalized pattern/type. Space carries the Rule collection revision. |
| `statement_imports` | Successful provenance only, provider/account format/type, statement dates/period, original controls/reconciliation, versions, importer, confirmed time and immutable confirmation totals/warnings. File-hash index is nonunique. |
| `statement_import_rows` | Immutable original extracted row plus review disposition and optional immutable confirmed Expense values, unique `(statement_import_id, source_row_id)` and same Space. Imported Expenses reference that row; deleting a current Expense cannot cascade into it. |
| `statement_import_operations` | Actor/Space/UUID unique key, immutable request hash, pending ownership/fence, terminal result/code and successful import reference. At most one import per operation. Never retain a failed operation's full review payload. |
| `account_deletion_operations` | Durable local cleanup/provider revocation progress and retry state, linked to a non-authenticating User tombstone and old provider identity ID for fencing. No deleted email/photo snapshots. |

JSONB is suitable for versioned immutable row/evidence/snapshot structures; fixed relations, money, dates and lookup keys retain typed columns/constraints. Deletion of a Personal Space removes all its related snapshots and operation metadata. Shared tombstones and evidence remain governed by Shared history retention.

## Identity, profile and deletion

Google remains the launch sign-in method. Name/photo edits go through Clerk, the existing sign-in identity boundary, followed by synchronization to the API's User projection. Do not create a second independent app-owned identity profile or accept arbitrary client identity claims. Email remains sign-in-identity-managed. Extend `GET /users/me` with `photoUrl` and deletion status; retain `PUT /users/me` as authenticated provider synchronization, not a profile-body update. Financial responses resolve current actor name/photo from this projection. Identity port capabilities and adapter tests must cover provider update/read/delete and session revocation for the chosen SDK at implementation time.

Account deletion is an explicit confirmed **deletion request**, not the current local-access-removal behavior:

- Immediately mark the local User `deletion_pending`, reject financial reads/writes and provisioning through that identity, revoke invitations/claims, and archive an active Shared Space. Permit only deletion-status access while its credential is still valid. Serialize this with financial writes so pre-deletion completed writes survive in Shared history.
- Permanently remove that User's Personal Space and its Expenses, Activity, Budgets, Categories, Rules, import evidence and operation metadata. Shared financial records and all formerly accessible archives stay available to their other existing members; never transfer or merge them into Personal.
- Remove the provider identity and revoke all its sessions through a retryable identity adapter. Erase profile email/name/photo, retaining only a non-authenticating Deleted user tombstone needed by Shared foreign keys. Remove their memberships/access. Shared Added By/importer/Activity identities resolve to that tombstone, never an old name/photo snapshot.
- Coordinate database cleanup and external identity deletion as an idempotent operation with durable progress and retry. These cannot be one database transaction. `DELETE /users/me` returns 202 with a location at `GET /users/me/deletion`, or 204 when all stages complete within that authenticated request; never report completed deletion after only local tombstoning. The status body is `{status: pending|completed}` with no financial/profile content. A recently revoked session cannot re-provision the identity because deletion fencing runs before provisioning. Status is accessible only while the initiating credential remains valid. Provider deletion/revocation may sign the app out before final server bookkeeping; sign-out must not be presented as proof that every stage completed. Server reconciliation finishes all cleanup even if no authenticated status request can follow or the app disappears.
- Clear this device's drafts, caches, receipts, passwords and temporary files when deletion is accepted; other sessions lose access and clear private local state when revocation/deletion is observed. Do not claim the API can instantly erase an offline device. No durable offline write queue exists.
- A later Google registration is a new identity/User with default Categories, no former Expense/import history and no previous Shared access. Never relink by matching email. An invitation can establish a new Shared Space through the normal lifecycle, not reopen an archive.

Deletion request IDs and provider-completion tombstones must be retained sufficiently to prevent replay/re-provisioning of the **old provider identity ID**, without retaining its email/photo or linking a genuinely new provider identity. Implementation must test partial provider failures and crash recovery; a webhook may assist reconciliation but cannot be the only cleanup mechanism. No identity deletion is executed during this planning task.

## Authorization and conflicts

Every financial query/mutation derives the actor from authentication and checks membership in the explicit destination Space. Client `spaceId`, Category, import and Expense IDs never grant ownership. Use same-Space foreign keys for all financial relationships. Personal access stays private; Shared members have equal editing rights. Archives permit Expense detail/Activity/deleted/import/report reads but reject new writes, configuration changes and new imports. Operation success replay/status uses read authority and its original actor binding, not an archived write path.

Require revision preconditions for every Expense/configuration mutation; missing preconditions are validation errors. Stale data returns `STALE_EDIT` with the affected revision and an instruction to reload/review, never last-write-wins. Preserve the local draft for comparison; do not silently merge another User's edits. Rules/Category eligibility and archive conflicts at confirmation also preserve the living draft. Refresh on navigation/focus/pull-to-refresh; no realtime synchronization system or offline editing queue is introduced.

## Implementation inventory and deliberate supersession

The source locations below describe the inspected implementation, not completed target changes.

| Existing seam | Required target change |
| --- | --- |
| `api/src/transactions/`, `database/entities/transaction*.ts` | Rename saved domain module, ports, records, controllers, DTOs, Swagger schemas/operation IDs and domain errors to Expense; add imported detail and uniform Personal/Shared edit/delete; date/required Category/revision invariants. |
| `transactions`, `transaction_activities`, `transaction_id`, `purchase_date` | Target `expenses`, `expense_activities`, `expense_id`, `expense_date`; rename constraints/indexes/sequences and Activity snapshot date keys consistently. Technical ORM/database transaction APIs remain unchanged. |
| Existing nullable `category_id`, `category_match_confidence`, source/import fingerprint columns | Required same-Space Category; matching provenance belongs in import evidence, not mutable categorization confidence. Keep duplicate fingerprints/reference hashes as advisory indexes; preserve immutable import/source-row links and Added By. |
| `src/statement-imports/presentation/statement-import.dto.ts` and service/store/unit of work | `transactions` save array becomes `expenses`; parsed originals stay `evidence.transactions`. `purchaseDate` becomes `expenseDate`; `bank`/`cardType` become provider/accountFormat. Require nonempty categorized/date-valid Expenses; add immutable evidence/confirmation snapshots, atomic remembered Rules, warning acknowledgment and operation protocol. |
| Unique `(space_id,file_hash)` on `statement_imports` | Replace with nonunique duplicate-search index; add unique actor/Space/operation key and one committed result per operation. Do not use file hash as operation identity. |
| `statement_imports` and current derived transaction count | Add immutable original/confirmed evidence rows, totals/counts, source row mapping and acknowledged warnings; independently project current/edited/deleted counts. Add separate minimal operation status storage. |
| `src/categories/`, `src/category-rules/` | Add Category icon key and atomic full configuration command/unit of work, aggregate revision and collection Rule revision checks. Allow full inactive maintenance while keeping it excluded from matching/plans/checks. Retire mobile-facing separate Budget/Rule mutation surface in the target contract. |
| `src/categories/...category-summar*`, period-matching summaries | New reporting projections for mixed-period exact plans, all-range Expense totals, completed-month breach counts, Yearly full-limit checks and confirmation-time import counts. No Budget version tables. |
| `src/users/`, `authentication/clerk-profile-service.ts`, Space lifecycle store | Add photo projection and provider-owned profile updates; replace local-only deletion with fenced, retryable provider/Personal-data cleanup, Shared tombstones and operation progress. |
| Personal financial controllers and `api/docs/route-compatibility.md` | Target uses only explicit Space financial resources. Remove aliases and old-name fields/routes with the breaking replacement, without the prior compatibility window; preserve current implementation until that work occurs. Disable remote Suggestion endpoint in the target. |
| `web/src/features/transactions/transactions-service.ts`, `shared/api/transaction-history.ts`, `shared/transaction/transaction.ts` | Audited legacy saved-record consumers; they will not consume this breaking contract. No edits in this effort. Cutover/decommissioning is a separate acceptance/handoff concern. |
| `web/src/features/statement-import/statement-import-service.ts`, `statement-import-api.ts`, local parser `statement-parser/transformer.ts` | Audited legacy commit/evidence/Account mappings. Port required local behavior into mobile independently; keep parsed Transaction terminology, remove server Suggestions and immediate Rule saves. No web edits. |

Rename generated schema families such as `ManualTransactionResponseDto`, `ImportedTransactionResponseDto`, history/Activity snapshots and collection counts to Expense equivalents. Target operation names include `listExpenses`, `createExpense`, `getExpense`, `updateExpense`, `deleteExpense`, `listDeletedExpenses`, `listExpenseActivity`, `saveCategoryConfiguration`, `previewStatementImport`, `submitStatementImportOperation`, `getStatementImportOperation`, and `getDashboardReport`. Inventory old `Transaction*`, `transactionId`, `transactionCount`, `transactions`, `purchaseDate`, `bank`, `cardType` in active API contract/runtime code; do not mechanically replace parser Transactions, provider literals, technical transactions, historical migrations or archived evidence.

The target supersedes conflicting portions of [Adopt Expense and Statement Entry terminology across Spendeazy](https://github.com/yororo/spendeazy/issues/118): Statement Entry naming, web edits, old-data preservation, Personal aliases and unchanged legacy import/edit behavior. Its earlier body remains historical context. [The replacement ADR](../adr/0004-mobile-expense-domain-and-contract.md) identifies the affected current ADRs without pretending the new runtime has shipped.

## Clean development setup and handoff

Implement against an explicitly selected **new disposable development database**, create the target schema through reviewed migrations, and seed fictional Users/Spaces/Categories/Expenses. Preserve checked-in historical migrations and evidence. A forward schema transition may rename existing objects on an empty database; no populated-data preservation/backfill or reverse data migration is required by this effort. Existing developer databases remain untouched unless separately and explicitly selected for reset. Do not reuse production credentials or run destructive reset commands as part of this specification.

At implementation, update API controllers/DTO metadata, generate/check `api/docs/openapi.yaml` and `.json` using the existing code-first procedure, inspect the changed paths/schemas, and build the mobile adapter against those target schemas. This spec is not a second executable OpenAPI artifact and does not edit generated contracts early. Keep `web/` source unchanged; the existing browser suite remains a required regression gate for this documentation PR, while target mobile/API acceptance is a later implementation gate. No claim of old web/new API coexistence is made.

## Acceptance examples

1. Personal and active Shared: a manually created Expense and an imported Expense both allow amount/date/description/Category edits and individual deletion; original Added By/import links are immutable. An unrelated edit can retain an inactive Category; assigning another inactive Category fails. Null Category and future Manila date fail all creation/confirmation paths.
2. Edit Category A from blue/Home to green/Household. Existing Expenses and Activity Category labels show Household/current color; before/after Category IDs remain unchanged. Rename a User and earlier Activity shows their current name/photo; delete them and Shared history shows Deleted user without the former photo/email.
3. Save Category + Yearly Budget + two Rules; induce a Rule conflict or stale revision and verify **none** of the three parts changed. Existing inactive settings remain editable but contribute zero planning/checks/matches until reactivation. An identical Rule for the same Category is a no-op; a conflicting other Category Rule is not moved.
4. Expense pagination for March 15–May 10 and Category A returns identical full-filter amount/count on every page, oldest/newest order is stable on equal dates, and a cursor for a different Category/Space is rejected. Dashboard Back restores its selections; Space switch clears them.
5. Budgets Home 1,200/month + Groceries 400/month + Transport 200/month + Travel 2,400/year produce a 2,000 monthly equivalent and 12,000 six-month Planned. Actual 12,500 is 500 above plan (4.2%); Travel usage 2,100 remains below its 2,400 yearly limit. On July 3, current-year Planned is 14,000. A 1,000/year Budget produces exactly 500 over six months and 1,000 over twelve, not 499.98/999.96.
6. Current Groceries 500/month compares a past month's 450 as under Budget. Deactivate it and actual 450 remains while planning/checks exclude it; reactivate and current settings participate again. A 400 limit is nearing at 320, at limit at 400, over at 400.01, regardless of rounded display. Zero Planned has no percentage. Monthly breach denominator excludes the current incomplete month.
7. A six-month window spanning two years returns separate full-calendar-year Yearly checks; no cross-year total is compared to one annual limit. Category chart selection does not change summary actual/plan/import totals. An April statement confirmed in May counts in May's import range.
8. A 1,000 purchase plus 300 outgoing transfer saves two Expenses totaling 1,300; 5,000 payment, 200 refund and cash-in remain excluded and do not net spending. Preserve original 10,000 debits versus 9,500 extraction warning; acknowledgment allows saving corrected/reviewed values without changing original evidence.
9. Import identical bytes twice deliberately: each acknowledged operation creates its own provenance/Expenses; retry either operation returns its original success without an extra import. Reuse the same operation ID with altered payload: 409. Crash before/after commit, race identical requests, lose the response and restart: status/result reflects exactly one atomic outcome; no partial Expenses/Rules/evidence and no unfenced pending-to-failed transition.
10. A Rule conflict or Category deactivation during review saves nothing and retains review. An unrelated Rule edit does not recategorize manually reviewed rows. Race archive/delete-account against confirmation: either the entire commit precedes the lifecycle change or the entire write is rejected; never redirect into Personal.
11. Confirm two Expenses at 100 and 200. Change the first to 150 and delete the second: original count/total remain 2/300; current count/total are 1/150; edited count 1, deleted count 1. Editing then deleting the same Expense increments both distinct indicators, not a purported partition. Original source rows/controls remain unchanged.
12. Session expiry resumes a living draft only for the same User. App termination loses the draft but preserves a minimal receipt for restart status while still signed in. Explicit sign-out clears the receipt/draft; no cross-sign-out recovery or automatic replay. Temporary PDF copies/passwords are removed after extraction/cancellation.
13. Delete a User while provider deletion temporarily fails: their financial access/provisioning stays blocked; background reconciliation completes identity/session/Personal cleanup without app cooperation. The other member retains archived Shared Expenses, Activity and imports. New registration never inherits the tombstone's memberships. Clearing local caches is not claimed as instant erasure on an offline device.

The [mobile acceptance and handoff decision](https://github.com/yororo/spendeazy/issues/133) incorporates these into Android/iPhone, HTTP and PostgreSQL gates. The [approved parser decision](https://github.com/yororo/spendeazy/issues/130#issuecomment-6352478040) selects bundled PDF.js with engine stream order. Its [Validate parser launch limits, older-device support and temporary-file cleanup](https://github.com/yororo/spendeazy/issues/138) follow-up remains a blocking delivery gate outside the planning map; current 10 MiB / 100-page proof guards are provisional and neither minimum OS nor low-memory/cleanup coverage is certified by this contract.
