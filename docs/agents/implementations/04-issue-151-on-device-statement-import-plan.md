# Implementation Plan: On-device Statement Import selection and interpretation

## 1. Overview

- **Objective:** Implement [issue #151](https://github.com/yororo/spendeazy/issues/151), as updated on 2026-10-29: replace the Import placeholder with supported PDF selection, local extraction and interpretation, and a stable in-memory handoff to #152.
- **Scope:** Mobile production parser, lifecycle/cleanup, Select file UI and structured extraction result. #152 owns review/Rules; #153 confirmation; #154 uncertain-save recovery; #155 full history/detail. No API or database changes are needed for this increment.
- **Constraints:** Three PDF formats only: BDO Amex, EastWest Visa and GCash E-Wallet. Bundled PDF.js, restricted local WebView, engine stream order, exact money and date-only values. No OCR, remote parsing/suggestions, CSV, PayPal or durable drafts. Follow mobile AGENTS.md, CODING_STANDARDS.md and root GLOSSARY.md. Plan only; implementation is separate.

## 2. Current State

Paths below are repository-relative. New paths are explicitly marked proposed.

- `mobile-app/src/app/(app)/import-statement.tsx` is an unavailable placeholder registered outside tabs in `(app)/_layout.tsx`.
- `mobile-app/src/prototypes/parser-proof/screen.tsx` combines native picker, password, WebView lifecycle and diagnostic presentation. It ignores stale operation messages and destroys the WebView on cancellation, but is not a production feature.
- Proof `webview-entry.ts` bundles PDF.js 5.4.296, reports page progress, disables remote resource loading and clears engine references. Its first page failure aborts the whole operation; most errors collapse into unreadable. File/page guards are provisional 10 MiB/100 pages.
- Proof `extraction.ts` supports engine order and experimental spatial sorting. Production must select engine order only.
- Proof `providers/` uses legacy Date/number outputs and throwing reconciliation. GCash includes description-based incoming detection; this is insufficient direction evidence for production.
- `scripts/build-parser-proof.mjs` generates ignored HTML and bundled provider modules; `scripts/parser-proof-regression.test.mjs` tests fictional ledgers, including old throwing behavior. `parser:prepare` runs in EAS post-install. React Native WebView is 14.0.1; Expo is SDK 58.
- `src/application/session.ts` owns identity/Space generations and a manual Expense draft only. `application/spaces/provider.tsx` derives unsaved work from that draft; imports cannot simply reuse its current remapping behavior.
- Shared `Screen`, `ScreenHeader`, `DesignSurface`, buttons, theme and modal primitives exist. Basic read-only history exists in `features/statement-import-history/`; do not rebuild it.

## 3. Proposed Solution

Create a feature-owned production implementation under proposed `mobile-app/src/features/statement-import/`. Keep route composition thin, view presentation-only, a controller for effects, a reducer for coordinated phases, pure interpretation rules, and native/WebView adapters. Reuse audited proof algorithms and bundling; do not import the prototype screen or demo Rules into production.

Use an application-owned in-memory import store above the signed-in route lifetime, tied to session ownership, so ordinary Back/backgrounding and same-User authentication can retain living work. Explicit sign-out/different identity/discard clears it; process death loses it. Keep passwords and PDF bytes solely in short-lived adapter references, never the store. Bind destination before selection; no draft remapping on Space changes.

Proposed result contract: owner User/Space, draft identity; file name/byte count/SHA-256 of actual PDF bytes; provider/account format/Statement Type; applicable statement/history dates; original controls and ordered structured rows; page outcomes; completeness assessment; classification evidence and typed warnings. Rows carry deterministic source-row IDs based on original page/order, original description/date/reference/amount, eligibility and exclusion reason. Keep signed source activity distinct from positive Expense candidates. Use integer minor units internally and decimal strings at boundaries; preserve date-only strings without local-time conversion. No raw text/geometry or PDF in the handoff. Review edits belong to a separate model in #152.

Partial extraction is reviewable only if usable rows/provider identity remain interpretable. Blank pages alone do not prove missing activity; image-bearing pages alone do not prove scanning. Record uncertainty and failed/unreadable page indices, never certify transaction completeness from text extraction alone. Unknown direction remains explicitly unresolved/noneligible, never guessed from description. Reconciliation is a separate advisory calculation over original evidence; failure to recognize a provider or parse any usable rows remains an actionable error.

```mermaid
sequenceDiagram
    participant U as User
    participant C as Import controller/store
    participant N as Native file adapter
    participant W as Local PDF.js WebView
    participant P as Pure interpretation
    U->>C: Select PDF (fixed User/Space)
    C->>N: Pick, track owned copy, hash bytes
    N-->>C: File identity and transient bytes
    C->>W: Extract with operation ID
    W-->>C: Password challenge / page progress
    U->>C: Retry password or cancel
    W-->>C: Ordered page outcomes
    C->>P: Interpret and reconcile locally
    P-->>C: Structured rows, controls, warnings
    C->>N: Clear owned PDF and byte references
    C-->>U: Ready for Update (#152 handoff)
    Note over C,W: Cancellation invalidates operation before teardown; late outcomes ignored
```

Research basis (official documentation checked 2026-10-29): [Expo SDK 58 DocumentPicker](https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/) requires a cache copy for immediate FileSystem access; [FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/) supplies File/Directory lifecycle operations; [Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/) supplies byte hashing. Use installed typings to select byte-digest APIs, not string hashing of base64. [PDF.js loading-task documentation](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html) describes password callbacks and asynchronous worker destruction; verify against pinned 5.4.296 types because the online reference is a draft. No dependency upgrade is implied.

## 4. Implementation Tasks

### Task 1: Define the production result and workflow state
- **Goal:** Establish the #152 boundary and deterministic lifecycle.
- **Location:** Proposed `features/statement-import/import-model.ts`, `import-state.ts`, `import-store.ts`; existing `application/session.ts`, `session-runtime.ts`, `application/spaces/provider.tsx` and `workflow.ts`.
- **Changes:** Define the contract above and phases idle, picking, preparing, extracting, password-required, interpreting, ready, failed and suspended. Generate draft/operation IDs outside reducers. Fence all async outcomes by operation and owner scope, including picker/hash failures and worker readiness. Register import work with session/Space unsaved-work policy without altering manual Expense category remapping. A Space switch with import work requires Keep editing or Discard/restart; archives block new work and retain completed evidence for inspection. Session expiry suspends delivery and clears secrets, retaining structured work for the same owner; resume interrupted extraction through reselection. Different identity/sign-out clears all import state. Backgrounding alone does not discard.
- **Verification:** Focused state/workflow tests for stale outcomes, cancellation/reselection, same/different identity, sign-out, Space switching and archive transitions; manual Expense tests still pass.

### Task 2: Implement file ownership and restricted extraction
- **Goal:** Local extraction with reliable resource cleanup and explicit page outcomes.
- **Location:** Proposed feature native-file adapter, extraction host and WebView entry; existing proof `webview-entry.ts`, `extraction.ts`, `scripts/build-parser-proof.mjs`, `package.json`, `.gitignore`; startup integration in `src/app/_layout.tsx`.
- **Changes:** Adapt single-PDF picker behavior; hash actual bytes before releasing them. Track only app-owned picker cache copies and a dedicated import cache area with random names. Track picker-created staging URIs in a minimal local cleanup journal; validate they are within the known picker cache location before deletion. Delete the staging copy after transfer into the owned area. Sweep journaled copies and the dedicated area once on startup before allowing new selection; never sweep general cache or user originals. Document the unavoidable crash interval between OS picker copy creation and receiving its URI, and inspect it under #138 rather than claiming unconditional cleanup.
  Extract bundled resources into a shared build path usable by proof and production; keep generated assets ignored and preserve `parser:prepare`/EAS preparation and license notices. Maintain CSP, navigation/resource restrictions, no storage/cache/debug output in the production WebView. Decode bridge messages defensively; reject wrong IDs/generations. Wait for worker readiness before sending. On cancel invalidate first, destroy host/worker, then clean resources; retry uses a fresh generation. Preserve page order; emit page outcomes and safe error codes, retaining earlier usable pages where safe. Do not forward raw engine errors. Retain provisional guards as explicit development safety caps pending #138, never advertised supported limits.
  Clear native/worker secrets and bytes on every terminal path; password retry retains only the necessary temporary local source. Cleanup failure becomes a sanitized retryable state, with pending cleanup retried at startup. Generic unreadable is acceptable where the engine cannot distinguish encryption/corruption; avoid false diagnostic claims.
- **Verification:** Fake native adapter tests for owned-only deletion, cleanup errors, startup ordering and late picker results; extraction fixtures for password/error/page outcomes; native cancel during progress followed immediately by another selection. Inspect filesystem after success/cancel/termination. Measure runtime separately under #138.
- **Dependencies:** Task 1.

### Task 3: Port provider interpretation and advisory reconciliation
- **Goal:** Financially correct structured results rather than legacy proof output.
- **Location:** Proposed feature `providers/`, money/date helpers and reconciliation module; existing proof `providers/` as assessed prior art and `scripts/parser-proof-regression.test.mjs` as fixture reference.
- **Changes:** Port the three transformers into production ownership, retaining ordered duplicate-looking rows and references. Separate provider recognition, structural parsing, row classification and reconciliation. Remove mismatch throws from usable-result paths; retain typed controls/warnings. Replace floating point output and Date conversions with exact money/date-only models. For GCash use explicit debit/credit, sign, balance or other independently verified statement evidence; remove description-only direction inference. Preserve payment/refund/credit/cash-in activity with immutable automatic-exclusion reasons. Do not infer unknown activity to satisfy controls. Record partial completeness and unknown classification evidence in the handoff.
- **Verification:** Independent fictional expected ledgers per provider: purchase 1,000 plus outgoing transfer 300 yields eligible 1,300; incoming/payment/refund rows remain excluded. Cover mismatch retaining rows, dates across years, wrapped references, identical-looking rows retaining distinct IDs, unsupported/ambiguous provider and unknown direction. Keep proof regression expectations separate from production warning semantics.
- **Dependencies:** Tasks 1–2.

### Task 4: Build the Select file experience and handoff
- **Goal:** Replace the placeholder with the designed native product entry.
- **Location:** Existing `(app)/import-statement.tsx`, `(app)/_layout.tsx`, `components/`, `features/statement-import-history/`; proposed feature view/controller and ready-result boundary.
- **Changes:** Reinspect current `design/mobile-design.pen` through Pencil: `naq2A`, progress `ugsNK`, selection surface `X2rbb`. Reuse Screen/header/surface/Outfit/theme/modal recipes. Provide supported-provider text, accessible file action, password retry, page progress, cancel, safe recovery and visible partial/reconciliation warnings. Use source geometry at 390 units with adaptive layout; both Appearances, large text and keyboard must work. Keep tabs/Add hidden in the existing stack route. Show fixed Space identity; switching requires discard/restart. Omit notification bell, mock accounts/PayPal/CSV, AI suggestions and sample financial data. Reuse actual recent history through its existing adapter/controller with empty/loading/error states and existing history navigation; no new detail or filtering features.
  Publish the ready structured result through the owning store and a small feature interface for #152. Until #152 exists, display an honest extraction-ready summary and explain review is not yet available; do not invent a successful review or enable confirmation/save. Back/Close must distinguish retained living work from explicit discard. Reselection replaces work only after discard acknowledgment where needed.
- **Verification:** Native Select file/password/error/cancel/reselect walkthrough; inspect the ready result with sanitized fixtures, no raw-text diagnostic panel. Verify recent history is real, no writes occur, no cross-Space leakage, and Back/reopen retains living results. Compare light layout against source and dark adaptation for legibility.
- **Dependencies:** Tasks 1–3.

### Task 5: Consolidate validation and handoff documentation
- **Goal:** Leave reproducible evidence and clear remaining launch gates.
- **Location:** Feature tests, `mobile-app/package.json`, proof README, `mobile-app/design/design-token.md`, `docs/local-testing.md`, implementation report in this directory.
- **Changes:** Register core tests in existing test scripts; preserve proof checks. Update source-node ownership and parser startup/cleanup instructions only where changed. Document result contract, safety caps, unsupported/uncertain states, remaining #152 integration and #138 measurements. Record app revision/dirty state, build/device/OS, expected/observed results and exact blockers. Do not include private PDFs/passwords/raw text or financial screenshots.
- **Verification:** Commands and device matrix below; report automated and native results separately. Do not mark pending device evidence complete.
- **Dependencies:** Tasks 1–4.

## 5. Testing and Validation

From `mobile-app/`: `npm run parser:test`, `npm test`, `npm run lint`, `npm run typecheck`. Add production provider/workflow fixtures to the appropriate existing scripts. No new browser gates or API/PostgreSQL tests for this local-only increment. Native setup follows `docs/local-testing.md`; Expo Go is unsuitable. Run a native build when native configuration/dependencies change.

Required Android-emulator and physical-iPhone checks: all three providers; missing/wrong/correct password; picker cancel, extraction cancel at a page milestone and immediate retry; corrupt/encrypted/image-only/mixed/partial inputs; ambiguous provider and reconciliation mismatch; background/foreground; Back/reopen; process termination/startup cleanup; session expiry/same-User recovery, sign-out/different identity; Space discard/restart and archive. Inspect owned files rather than trusting UI messages. Verify light/dark, 320/360/390 widths, large text, safe areas/keyboard, Android Back and screen-reader labels/focus. No airplane-mode/offline-proof gate. True peak memory, older-device floors and certified limits stay with #138.

## 6. Acceptance Criteria

| Observable outcome | Task |
| --- | --- |
| Designed signed-in Select file route replaces placeholder; no false save/review success | 4 |
| Local bundled engine, ordered pages, password/error/progress/cancel and late-result fencing | 1–2 |
| Exactly three providers; exact financial/date values, preserved rows and direction evidence | 3 |
| Partial/mismatch warnings retain usable results without certifying completeness | 2–4 |
| Stable owner-bound structured #152 handoff separate from secrets and future review edits | 1, 3–4 |
| Owned-only cleanup after terminal paths and startup; originals preserved | 2, 5 |
| Identity/Space changes cannot inherit or redirect private work | 1, 4 |
| Focused fixtures plus recorded Android/iPhone evidence; #138 remains explicit | 5 |

## 7. Assumptions and Open Questions

- #143 is completed. #152 is not required to implement extraction, but end-to-end Update navigation remains pending until it consumes this result; this increment must say so visibly.
- The current shipped OpenAPI accepts reviewed Expenses and limited metadata; it is not the complete future evidence/preview protocol. Do not extend or squeeze this local handoff into existing commit requests; #153 owns that work.
- Provider variants without independent direction/completeness evidence remain explicitly uncertain; additional sanitized examples or attributed human ledger review are needed before claiming support for those variants.
- PDF cleanup cannot promise secure memory erasure or cleanup in every OS picker crash interval. Implement scoped ownership and startup recovery, record observed gaps, and keep #138 open until the required termination evidence passes.
