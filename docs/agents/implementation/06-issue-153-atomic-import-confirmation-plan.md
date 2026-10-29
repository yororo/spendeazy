# Implementation Plan: Atomic reviewed-import confirmation with warning overrides

## 1. Overview

- **Objective:** Deliver [issue #153](https://github.com/yororo/spendeazy/issues/153): inspect the final review, explicitly acknowledge advisory warnings and atomically confirm one complete Statement Import into its original Space, with durable immutable success replay.
- **Scope:** API preview, full evidence validation/storage, warning protocol, operation PUT, remembered Rules, native Confirm and coordinated mobile adapter/OpenAPI changes. Consume the implemented #151/#152 handoff. #154 owns operation GET/status recovery, processor recovery/fencing, durable device receipts and restart/session recovery presentation; #155 owns full committed-import history/detail presentation. #138 remains the parser launch gate.
- **Constraints:** Plan only. Retain exact PHP arithmetic, Manila dates, authenticated same-Space authority, the 1 MiB body limit, on-device parsing/matching and existing lifecycle protections. No partial/chunked financial commits, server parser, silent row removal, destination switching, Uncategorized continuation or retired web work.

Authority: [#140](https://github.com/yororo/spendeazy/issues/140), the [accepted #132 resolution](https://github.com/yororo/spendeazy/issues/132#issuecomment-6378662168) and its [pinned detailed contract](https://github.com/yororo/spendeazy/blob/0a5983408507bdecb771ac16c5a440f82a5595e7/docs/specifications/mobile-expense-domain-api.md#import-preview-confirmation-and-recovery). The latter is absent from the current local tree; use the linked accepted version, not its obsolete implementation inventory. Later issue requirements override illustrative design content. All repository paths below are root-relative; proposed files are explicitly identified.

## 2. Current State

- Mobile already implements memory-only extraction/review, scoped catalog loading, staged Rules and validated `ReviewHandoff` in `mobile-app/src/features/statement-import/`. `import-store.ts` guards Continue and `backToReview`; `review-model.ts` exports original evidence, applied rows, assignment context, staged Rules and catalog revisions. `src/app/(app)/import-statement.tsx` currently renders the read-only Review ready boundary. Back, suspension, sign-out and destination protections already exist.
- `ImportResult` in `import-model.ts` uses bigint minor units, `credit-card`/`e-wallet` and local GCash format `e-wallet`. It lacks parser/engine versions and detailed reconciliation comparisons. Original controls can contain unparseable text, repeated kinds and no stable control key. Ineligible rows include unknown direction/invalid values, beyond the accepted wire example's six classifications. The handoff cannot simply be JSON-stringified.
- `api/src/statement-imports/application/statement-imports.service.ts` validates and commits limited metadata plus Expenses through `statement-import-confirmation.ts` and `api/src/database/unit-of-work.ts`. It creates creation Activity atomically, hashes GCash references, and supports a boolean probable-duplicate acknowledgment. There is no preview, full evidence, operation identity or Rule commit in that boundary. Empty Expenses are not explicitly rejected by its domain validator.
- `space-statement-imports.controller.ts` exposes the older POST `/statement-imports` plus GETs. The POST performs write authorization before entering the unit of work, which cannot serve archived successful replays.
- `typeorm-imported-expense-store.ts` uses active-only predicates for duplicate queries; deleted imported Expenses are currently missed. File hash is already nonunique. Current import history derives a live nondeleted count, not immutable confirmation totals.
- Category configuration uses `lockWritableSpace` and existing normalized Rule uniqueness/revisions. Import `lockForStatementImport` currently calls `prepareWritableSpace`, which locks the actor but does not exclusively lock the Space. Strengthen the import boundary to serialize with configuration and lifecycle changes; do not assume its current method name guarantees that lock.
- `api/src/bootstrap.ts` rejects unknown fields and enforces `MAX_REQUEST_BODY_SIZE = 1024 * 1024`. `database-options.ts` explicitly registers entities/migrations; latest migration is `1980000000000-add-category-configuration-revisions.ts`.

## 3. Proposed Solution

Use one explicit wire serializer and API validator for `{statement, evidence, expenses, excluded, rememberedRules, acknowledgedWarnings, acknowledgedWarningDigest}` from the accepted contract. Keep extraction evidence and confirmed Expense values separate. Preview is stateless, returns `{warnings, warningDigest}` and never stores the review. Confirmation uses the same normalization/validation/warning builder under an exclusive destination Space lock.

Define deterministic, versioned canonical JSON: fixed property ordering, exact decimal strings, documented null handling, preserved source-row order, normalized descriptions/Rule keys, and sorted set-like collections. Stable warning IDs derive from type and sorted scoped references/diagnostics rather than display-message text. Warning digest hashes normalized content, original Space and sorted warning records, excluding acknowledgment fields. The separate operation request hash includes acknowledgment fields and all admitted request content. Do not drop meaningful evidence fields or hash only included Expenses. Raw duplicate references are replaced with the existing Space/provider-scoped HMAC before any persistent hash/snapshot; the raw value never reaches storage, errors or returned evidence.

Retain original reconciliation assertions and derive reconciliation warnings from those assertions, including unavailable/partial extraction diagnostics. Do not reconcile edited Expenses against statement totals or treat client evidence as bank verification. Exact-file lookup is Space scoped; probable duplicate lookup includes retained deleted imported Expenses and within-payload repeated signals. Keep every reviewed row.

Store immutable import-level evidence/versions/totals/warnings on the successful import, immutable original/disposition/confirmed row snapshots in proposed `statement_import_rows`, and separate minimal `statement_import_operations`. Operation identity is `(authenticated User, original Space, UUID)`, unrelated to extraction attempt/draft/file hash. Unique operation identity and one successful import per operation prevent duplicate writes. Financial writes and immutable success result share one database transaction.

Operation admission may durably reserve only identity, immutable request hash and pending metadata, never the financial payload. Use database row locking throughout execution, not an expiring lease as permission to create another commit. All executors re-read terminal state while holding the operation lock before writes. Known success is replayed with read authority and original actor binding before current write/Category checks; return the stored result unchanged. Deterministic domain rejection becomes stable terminal metadata while financial changes remain rolled back. Unexpected database/transport outcomes remain unresolved. #154 must reuse this lock/state boundary; it cannot declare a pending operation failed from elapsed time alone.

```mermaid
sequenceDiagram
    participant M as Native Confirm
    participant A as Import API
    participant D as PostgreSQL
    M->>A: POST preview (complete reviewed JSON)
    A->>D: Authorized Space-scoped reads
    A-->>M: Warnings and content-bound digest
    M->>M: Explicit Import anyway if warnings; freeze request
    Note over M: #154 receipt must persist before PUT
    M->>A: PUT original Space / operation UUID
    A->>D: Admit hash; lock actor, Space, operation
    alt Existing success and identical request
        A-->>M: 200 immutable original result
    else New execution
        A->>A: Validate and recheck warnings, Categories, Rules
        alt Changed warnings or validation/conflict
            A->>D: Terminal metadata only; no financial writes
            A-->>M: Typed error; retain review
        else Valid
            A->>D: Commit import, rows, Expenses, Activity, Rules, result atomically
            A-->>M: 201 committed result
        end
    end
```

Research checked 2026-10-29: [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) supports transaction-held row locks and consistent acquisition order; [TypeORM transactions](https://dev.typeorm.io/docs/transactions/) requires every participant to use the supplied transaction manager. These support extending the existing unit of work rather than invoking independent configuration transactions. [Expo SDK 58 Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/) supplies UUID generation through the installed dependency. No dependency/SDK upgrade is proposed.

## 4. Implementation Tasks

### Task 1: Define the complete evidence and operation contract

- **Goal:** Establish a lossless, private serialization boundary before persistence/UI work.
- **Location:** Existing `api/src/statement-imports/presentation/statement-import.dto.ts`, application input/error models, `mobile-app/src/features/statement-import/import-model.ts`, `providers.ts`, `reconciliation.ts`, `review-model.ts`, `values.ts`; proposed feature `confirmation-payload.ts` and API canonicalization/validation modules.
- **Changes:** Implement the accepted nested field shapes, provider tuples (`bdo/amex/credit_card`, `eastwest/visa/credit_card`, `gcash/wallet/e_wallet`), null/date rules, Rule fields and acknowledgment fields. Serialize every source row exactly once into included or excluded disposition; reject missing, duplicate, unknown and overlapping IDs and automatic-exclusion inclusion. Require at least one valid included Expense, positive exact numeric(15,2) amount, nonblank bounded description, nonfuture Manila date and active destination Category. Validate remembered Rule targets even when their originating row was later excluded. Reject unknown nested fields rather than silently stripping them.
  Add parser format/version and actual bundled engine version to extraction output, stable control keys, original control text and structured original reconciliation comparisons/diagnostics at the point they are calculated. Preserve source order/classification evidence and original versus edited values. Never fabricate missing versions/comparisons or convert absent/unparseable controls to zero. Proposed additive wire handling: allow locked `unknown_direction`, `invalid_date`, `invalid_amount` classifications with automatic exclusions, nullable normalized values, and explicit original-control/page/completeness evidence fields. Keep the six accepted financial classifications unchanged; document these extensions in generated DTOs so local unresolved rows are retained rather than falsely classified/dropped. Match source is taken from saved assignment context, with Exact/Contains mode resolved from the handoff catalog/staged Rules.
  Define the privacy allowlist for all original text/diagnostics; prohibit full identifiers/text/PDF/passwords and raw references outside ephemeral `duplicateReference`. Add deterministic warning/request canonicalization and separate hashes as described above. Specify the committed response exactly: `{status: committed, operationId, statementImportId, confirmedAt, originalExpenseCount, originalExpenseTotal}`, counts as decimal strings and total as exact PHP decimal.
- **Verification:** Fictional serializer/API-validator tests cover the whole mixed ledger, unknown/invalid locked rows, empty confirmation, malformed/duplicate dispositions, excessive precision, future Manila/leap dates, exact provider mapping, bigint conversion, original controls preserved, deterministic hashes and privacy rejection. Changing acknowledgments changes request hash but not warning digest; meaningful evidence/Space changes invalidate warning acknowledgment.

### Task 2: Add immutable evidence and operation persistence

- **Goal:** Preserve successful provenance independently from mutable Expenses.
- **Location:** `api/src/database/entities/statement-import.entity.ts`, `expense.entity.ts`, `database-options.ts`, `src/statement-imports/application/statement-import-store.ts`, corresponding TypeORM store; proposed row/operation entities, feature-owned ports/adapters and forward migration under `src/database/migrations/`.
- **Changes:** Persist immutable confirmation time (reuse existing `importedAt` storage mapped as `confirmedAt`, without a second clock), included/excluded counts, original Expense count/total, versions, original controls/reconciliation/diagnostics and acknowledged warning records/digest. Add immutable row snapshots with original structured evidence, disposition and optional confirmed values; unique `(statement_import_id, source_row_id)` and same-Space constraints. New imported Expenses must reference the corresponding included snapshot; Expense edits/deletion cannot update/delete it. Do not fabricate historical evidence for older imports; follow existing nullable legacy-provenance conventions where a forward migration needs them.
  Add actor/Space/UUID unique operations, immutable request hash, pending/terminal status and original success result/import relation, with at most one import per operation. Terminal failure stores safe code/details only, no review payload. Retain successful keys for import lifetime and terminal metadata until applicable User cleanup. Keep file-hash index nonunique. Integrate same-Space foreign keys, writable-Space guards and existing Personal deletion/Shared retention behavior; register new entities/migration explicitly.
- **Verification:** Fresh disposable PostgreSQL migration chain, row/Space/operation uniqueness and referential tests; verify editing/deleting an Expense retains its evidence and success snapshot, and deleting Personal data can clean the new relations in valid order. No existing developer database reset.
- **Dependencies:** Task 1.

### Task 3: Implement stateless preview and stable advisory warnings

- **Goal:** Display exactly the warnings confirmation will recheck.
- **Location:** Existing import service, `probable-duplicates.ts`, `import-fingerprint.ts`, `node-gcash-reference-hasher.ts`, imported Expense store/port; proposed preview controller and shared warning builder under `api/src/statement-imports/`.
- **Changes:** Add POST `/api/v1/users/me/spaces/{spaceId}/statement-import-previews`, authorize original destination and validate the complete payload without writes. Reuse exact fingerprint and HMAC semantics. Add duplicate-specific retained-history queries rather than changing active browsing/edit predicates. Batch scoped fingerprint/reference and file-hash lookups for full payloads. Emit accepted reconciliation/exact_file/probable_duplicate warning shapes with stable sorted IDs/references, including retained deleted matches and within-payload duplicates. Return one digest from the same canonicalization used at confirmation. Validate permitted references/diagnostics but never parse PDFs or rematch Categories. A Category/Rule/authority failure is a blocking typed error, not an overridable warning.
- **Verification:** Preview creates no import/operation/Expense/Activity/Rule/draft. Equivalent input/query result ordering yields identical warnings/digest; other-Space records never appear; deleted matches remain warnings; changed original reconciliation or duplicate set changes digest. Mismatch/unavailable controls do not net or remove spending rows.
- **Dependencies:** Tasks 1–2.

### Task 4: Extend the atomic unit of work with operations and remembered Rules

- **Goal:** Guarantee one complete confirmation or no financial write.
- **Location:** Existing `statement-imports.service.ts`, `statement-import-confirmation.ts`, `api/src/database/unit-of-work.ts`, `typeorm-statement-import-store.ts`; Rule validation/store seams in `api/src/category-rules/`, configuration revision logic in `api/src/categories/infrastructure/`, Space guards/lifecycle.
- **Changes:** Admit an operation with a unique scoped key/hash in a short metadata-only transaction; compare an existing hash before processing. The financial execution acquires actor protection, exclusive original Space lock and operation row lock in consistent User → Space → operation order, then rechecks state, membership, Category eligibility and proposed Rule keys. Admission must not hold operation locks while waiting for actor/Space locks. Inspect existing success using read access before invoking writable guards so archived replay works. Serialize concurrent identical PUTs; a follower waits then returns original success, or remains pending without starting a concurrent executor. Never expire/recreate a successful key.
  Use the same transaction manager for every participant. Recheck current warnings: nonempty warnings require the exact displayed ID set/digest; changed/missing/stale acknowledgment returns `IMPORT_REVIEW_REQUIRED` with refreshed typed warning metadata and saves no financial data. Empty warning sets require empty/null acknowledgment. Validate before allowing any override.
  Normalize staged Rules using existing matching-text/rule-key functions; identical same-Category keys, including duplicates in the request, are no-ops. Different Category ownership, including inactive owners, rejects the whole import. Append new Rules, never replace a Category's complete Rules via its configuration command. Increment each actually affected Category revision once and Space Rule revision once for the changed batch; no-ops increment neither. Do not globally require the review's old Rule collection revision or rerun matching for unrelated edits.
  Write import, immutable rows/confirmed values, all included Expenses and creation Activity, Rule batch/revisions and success result in one transaction. Validate all known conflicts before financial inserts; use a transaction savepoint if terminal metadata must survive a later deterministic failure. Re-read/lock the operation before recording terminal failure; no executor may later write after terminal state. Unexpected failures roll back financial writes and leave the operation unresolved for the same frozen-payload retry/#154 recovery. Do not mark a database disconnect or timeout definitive. Delayed requests must always encounter the retained terminal/pending identity.
- **Verification:** Barrier-controlled real PostgreSQL tests for simultaneous identical requests, different payloads, two operations on one file, configuration/deactivation/archive races, Rule batch no-ops/conflicts and injected failures after each write stage. Assert one import/result and exact expected Expenses/Activity/Rules/revisions, or none. Replay after Expense edits/deletion and archive returns the original totals without current Category validation; another member cannot replay the original actor's operation.
- **Dependencies:** Tasks 2–3.

### Task 5: Publish the preview/operation HTTP contract

- **Goal:** Replace the unsafe older confirmation entry point with typed operation semantics.
- **Location:** `api/src/statement-imports/presentation/`, `statement-imports.module.ts`, `api/src/http/api-error.dto.ts`, feature errors/mappers; `api/test/statement-imports.e2e-spec.ts`, `api/docs/openapi.yaml`, `api/docs/openapi.json`.
- **Changes:** Add UUID-scoped PUT `/statement-import-operations/{operationId}` with first success 201, identical success replay 200, changed payload 409 `IMPORT_OPERATION_PAYLOAD_CONFLICT`, warning refresh 409 `IMPORT_REVIEW_REQUIRED`, and established validation/authority/413 responses. Preserve original terminal error behavior on identical failed-operation replay. Return canonical import Location on success. Prefer waiting for the operation lock in #153; if a bounded pending response is added, define 202/status Location with #154 before enabling it. Remove the old POST `/statement-imports` route/boolean acknowledgment DTO rather than leaving a bypass to incomplete non-operation imports; retain existing import GET routes. No legacy compatibility alias is required in this development project.
  Expose immutable successful evidence through the existing authorized import detail mapper as needed for #155, omitting raw references; keep current history projection fields clearly separate from original totals. Do not build #155 presentation. Update Swagger error details and generate/check both OpenAPI artifacts from metadata. GET operation recovery remains #154's endpoint.
- **Verification:** Assembled HTTP tests for nested unknown-field rejection, all statuses, actor/Space isolation, archive replay versus new-write rejection, safe evidence responses, old POST removal and actual body-limit enforcement. Inspect generated paths/schemas and run OpenAPI contract checks.
- **Dependencies:** Tasks 1–4.

### Task 6: Add the native confirmation controller and adapter

- **Goal:** Consume the living handoff without losing review or introducing unsafe retries.
- **Location:** Proposed `mobile-app/src/api/statement-import-confirmation-api-client.ts` and feature confirmation controller/state modules; existing `authorized-request.ts`, `request-failure.ts`, `import-store.ts`, `import-state.ts`, `index.ts`, `application/session.ts`.
- **Changes:** Decode preview, success and typed conflict responses against generated OpenAPI. Serialize only the current validated handoff for its original owner/Space/review revision. Fence preview/save completions by session generation, draft and request identity; edits/Back invalidate preview/acknowledgment but retain the review. Derive summary/category totals in bigint centavos from included applied values, never controls or floating-point sums. Preserve the actual immutable request JSON for a submitted operation in memory; repeated taps/live retries reuse its UUID and payload, including acknowledgment fields.
  Provide #154's submission seam: `beforeSend({userId, spaceId, operationId})` must successfully persist the minimal receipt before any PUT. No default no-op receipt hook, unreceipted production send or financial draft persistence. #153 adapter/controller tests can inject this capability; production submission remains gated until #154 supplies it. Handle unknown transport outcomes as “Saving hasn’t been confirmed”, retain frozen payload and prohibit editing/new-ID retry while the original outcome is unresolved. #154 owns Check status/restart/session UI; do not claim cancellation on Back/Close.
  Definitive validation/Rule/Category/review/413 errors retain all living edits and staged Rules; actionable errors lead back to review. Renewed warning acknowledgment or corrected content after definitive failure uses a new confirmation UUID. Success clears/completes the draft once and refreshes affected Space resources through existing refresh patterns. Archive failure retains inspectable work in the original Space. Never replay after restart or redirect to Personal.
- **Verification:** Adapter/controller tests exercise preview races, Back/edit invalidation, stale identity completions, receipt failure preventing send, repeated taps, frozen identical retry after response loss, refreshed warnings/new UUID, 400/409/413 retaining review and success completion once. Assert no raw local model JSON serialization or financial receipt data. Keep existing session/review tests green.
- **Dependencies:** Tasks 1 and 5; #154 receipt capability gates production submission.

### Task 7: Build Import / Confirm from the approved design

- **Goal:** Deliver the final inspection and explicit warning action on Android/iPhone.
- **Location:** Existing `mobile-app/src/app/(app)/import-statement.tsx`, import/review views; proposed feature confirmation view; shared `src/components/`, theme and `mobile-app/design/design-token.md`.
- **Changes:** Replace Review ready with full-screen Confirm using verified `mobile-app/design/mobile-design.pen` nodes `nny4o`, header/progress `W6Qd7m`/`MT4Nx`, Found/Import/Excluded `qbNy8`, donut/list `xym3i` and actions `Q9f0C`. Reuse surfaces, Outfit, Category colors/marks, shared modal/buttons and existing SVG chart primitives. Found is all original rows; Import/Excluded partition them. Donut/center total/list use exact reviewed included values with accessible text equivalents.
  Show actual provider/account format, statement date/history range, PHP and fixed destination. Primary action is Import to [destination]; secondary is Back to review, saving nothing. Display advisory warnings before one explicit Import anyway action captures all displayed IDs/digest. Adapt loading, retry, refreshed-warning and blocking-error states with shared components. Hide tabs/Add and unavailable notifications; omit Uncategorized/categorize-later illustration. Close follows Keep editing/Discard before submission; after dispatch it must not imply server cancellation. Use scrolling, native safe areas, dynamic text, 48-unit controls and 52-unit primary actions; document dark/loading/warning adaptations.
- **Verification:** Native Android-emulator and physical-iPhone journeys from actual #152 review through preview, warning acknowledgment, Back, validation conflicts and successful confirmation once #154 receipt integration is present. Compare light hierarchy to the source; verify dark contrast, large text, narrow widths, safe areas, Android Back and screen-reader labels/focus. Separate device evidence from mocked tests.
- **Dependencies:** Task 6; final submission journey depends on #154 integration.

### Task 8: Complete regression, payload-envelope evidence and handoff documentation

- **Goal:** Prove the financial boundary and record remaining delivery gates honestly.
- **Location:** Existing API HTTP/PostgreSQL suites (especially `statement-import-rollback-postgres.e2e-spec.ts`, `expense-statement-import-space-postgres.e2e-spec.ts`, Category/Space suites); mobile review/session tests; proposed confirmation tests; owning READMEs, `api/ARCHITECTURE.md`, `api/docs/DATABASE_DESIGN.md`, implementation report alongside this plan.
- **Changes:** Register critical tests in existing runners, reusing isolated import database fixtures rather than adding an unconfigured tenth URL. Measure complete UTF-8 JSON bodies, including all evidence/acknowledgments, for fictional fixtures from all three providers and representative large ledgers. Record byte counts and fixture sizes without declaring #138's provisional PDF limits supported. Exercise just-under/over 1 MiB through the real HTTP parser; no truncation/chunking. Update shipped contract/architecture and mobile public handoff documentation, explaining #154/#155 boundaries and the guarded submission seam. Preserve unrelated user changes and do not edit generated OpenAPI by hand.
- **Verification:** Run section 5 checks. Record any unsupported evidence envelope as an explicit follow-up decision; never silently remove evidence, raise the limit or claim full delivery while a required fixture cannot fit. Do not mark missing physical-device/recovery integration checks complete.
- **Dependencies:** Tasks 1–7.

## 5. Testing and Validation

Core financial scenario: PHP 1,000 purchase plus PHP 300 outgoing transfer produces exactly two Expenses/PHP 1,300; payment PHP 5,000, refund PHP 200 and cash-in remain visible in excluded evidence. Preserve an original 10,000-versus-9,500 reconciliation warning independently from corrected values. Include distinct duplicate-looking source IDs, unknown direction, manual exclusion and remembered Rules.

Required core suites cover:

- Full row accounting/privacy/positive exact amounts/Manila boundaries; preview creates zero records; all warning classes, stable digest and acknowledgment refresh after concurrent import, including deleted duplicates.
- Rule normalization across Exact/Contains, inactive-owner conflicts, same-Category no-ops, per-Category/Space revision increments and unrelated changes preserving reviewed assignments.
- Injected rollback at evidence, Expense, Activity, Rule and result stages; concurrent same-ID requests and changed payloads; lost response followed by same-ID replay; intentional same-file/new-ID reimport with renewed acknowledgment.
- Original result/evidence survives edits, deletion, Category changes and archive: original 2/300 remains 2/300 when current Expenses become 1/150. Read authority/original actor is still mandatory. Lifecycle/configuration races serialize without partial writes/deadlocks.
- Living review survives definitive errors/413/Back; uncertainty never enables another operation. Receipt-before-send contract, stale session responses and restart non-replay are coordinated with #154; full restart/fencing acceptance remains there.

From `api/`: focused import unit and HTTP/PostgreSQL tests during iteration; final `npm test -- --runInBand`, `npm run test:postgres` (all nine unique configured URLs), `npm run build`, read-only `npx eslint "{src,apps,libs,test}/**/*.ts"`, `npm run openapi:generate`, inspect diff, then `npm run openapi:check`. Include new cases in the existing full e2e/PostgreSQL runner. Use `npm run test:migration-image` when migration runtime packaging changes.

From `mobile-app/`: register confirmation tests in `npm test`; run `npm test`, `npm run parser:test`, `npm run lint`, `npm run typecheck`. Use `docs/local-testing.md` for installed native development builds, Android emulator and physical iPhone. Record OS/device/build/revision and pending evidence separately; Expo Go/mock tests do not establish native acceptance. No application suites need running merely to create this plan.

## 6. Acceptance Criteria

| Observable result | Tasks |
| --- | --- |
| Complete validated, privacy-safe evidence/Expenses/exclusions/Rules; each original row accounted once; required fields/categories and original controls retained | 1–2 |
| Stateless scoped preview; stable reconciliation/exact/probable warnings including deleted matches; explicit acknowledgment and changed-warning rejection | 3–4 |
| Atomic import/evidence/Expenses/Activity/Rules/result; no-op/conflict/revision semantics and lifecycle serialization | 2, 4 |
| Scoped immutable operation hash/result; 201/200/409; concurrent/response-loss replay once; archived replay with original actor/read authority | 4–5 |
| Deliberate same-file reimport is separate, warned and uses a new UUID; successful keys cannot expire into another import | 2–5 |
| Designed native Confirm, exact summaries, fixed destination, accessible light/dark, Back/error retention and honest uncertainty | 6–7 |
| Actual 1 MiB full-evidence validation, generated OpenAPI/mobile parity and critical HTTP/PostgreSQL/native evidence | 5, 8 |
| #154 receipt/status/fencing seam documented and enforced; #155 receives immutable evidence/totals without expanding this issue into history UI | 2, 5–8 |

## 7. Assumptions and Open Questions

- #152 is implemented locally despite #153's older placeholder baseline; its remaining device-certification gaps are not completed by this plan. Extraction classifications remain assertions. Proposed additive evidence/classification fields preserve currently produced locked rows; review them against the accepted contract during Task 1 rather than inventing an eligible classification.
- #153 can deliver/test its backend, preview and Confirm UI independently. Production PUT activation requires #154's durable receipt-before-send implementation. Coordinate that shared capability in parallel issue work or leave sending explicitly gated; shipping an unreceipted send would violate the accepted protocol. Full uncertain/restart recovery is not claimed complete by #153.
- The proposed simplest processor holds the operation database lock through its financial transaction and has no time-based takeover. #154 may add recovery ownership/fencing, but must preserve terminal-state checks and the same lock ordering. Pending/unknown cannot be labeled not_committed simply because no success is currently visible.
- No known envelope overflow was established during planning. Task 8 measures actual complete payloads; a genuine required unsupported envelope needs an explicit follow-up decision before claiming that acceptance criterion.
