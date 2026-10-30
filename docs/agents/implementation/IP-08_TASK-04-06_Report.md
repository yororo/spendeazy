# IP-08 tasks 04–06 handoff

One consolidated report for tasks 4, 5 and 6. The pre-existing tasks 01–03 report and staged implementation were preserved.

## Development nuances

- Import detail and import lists require a scalar positive `sourceSpaceId` matching the selected authorized Space. Import-origin Expense links also pass that parameter: the existing general Expense route now gates those links before mounting its controller. It remains optional for ordinary Expense navigation. This prevents an already pushed import journey from reinterpreting an Expense ID after a Space switch.
- Fixed-scope Expense browsing shares the existing workflow, endpoints, mutations and revision invalidation, but owns local selection and scroll. Import ID travels in every page request; deleted mode participates in query identity. The route memoizes its fixed-scope object so ordinary renders do not replace the workflow. Changing global tab filters does not populate the import selection, and local changes do not write back to the tab.
- Detail focus refreshes projections, Categories and membership. The Spaces provider recreates its public `refresh` callback during renders; the detail controller keeps the latest callback in a layout-effect-updated ref to avoid a focus/request loop. Keep focus callbacks stable when extending this journey.
- Original rows are progressively disclosed in a FlatList, retaining excluded rows and independent edited/deleted indicators. Original Category IDs remain visible next to current labels. Missing membership after a successful load means Deleted user; failed/loading membership or Category requests have separate text. The existing Expense detail/Activity controller uses the same distinction.
- No dedicated detail design board exists. The implementation adapts `UPHFB`, `Qd5CZ`, shared glass surfaces and semantic dark colors. Source JSON and component tests establish structure/behavior, not native visual acceptance.

## Acceptance evidence and limits

| Acceptance area | Evidence |
| --- | --- |
| Original 2/300.00 versus current 1/150.00, retained excluded evidence, reverted edits, overlapping statuses, zero and large totals, concurrent snapshot | Existing PostgreSQL immutable-evidence test from tasks 01–03 rerun successfully; new detail component tests separately assert presentation and row actions. |
| Manila midnight, inclusive dates, descending same-time ID ordering, multi-page traversal, filter-bound cursors, Dashboard agreement, foreign/unauthorized detail | Added authenticated real-PostgreSQL test in `dashboard-reporting-http-postgres.e2e-spec.ts`; unauthorized Space reads deliberately expect the existing 404 contract. |
| Replay counts once, deliberate reimport separately, archive access and immutable confirmation result | Existing reviewed-import PostgreSQL suites rerun through the required full runner. |
| Route validation, superseded reads, cancellation, obsolete identity, 404/retry, legacy current actions | New detail workflow and component suites; existing history workflow and adapter suites. |
| Import pagination, active/deleted endpoint choice, blank initial filters, local scroll, fixed import ID, mutation invalidation, unchanged global selection, Space invalidation | New rendered-controller `import-browse.test.mjs`, alongside existing Expense workflow/adapter tests. |
| Current labels / Deleted user and archived inspection presentation | Component fixtures show renamed Category, Deleted user and archived links. Live rename/removal and full native return journey remain pending. |
| Recent/Dashboard entry points and retained history state | Existing history navigation/workflow checks; new routes push through the existing stack. Device scroll retention and edit/delete/Back acceptance remain pending. |

Automated verification completed on 2026-10-30: mobile `npm test` (229 passing), lint and typecheck; API focused projection/service suites (27 passing), dedicated Statement Import HTTP suite (19 passing), build, read-only full lint and OpenAPI check; required `test:postgres` runner (19 suites / 129 tests passing) with ten distinct disposable PostgreSQL 16 databases. Parser definitions/output fixtures were unchanged, so parser regression was not rerun.

The first new PostgreSQL test expected 403 for inaccessible Space reads; it was corrected to the established 404 behavior and the entire runner passed afterward. Repeated full runners require recreating only the disposable ownership-migration database because that suite intentionally requires an empty database. No local manual database was reset.

Native acceptance is **not complete**. ADB detected the running `Pixel_10` emulator; the Expo automation tool had no local tunnel, and the computer-use window request timed out awaiting app approval before any screenshot or app interaction. No physical iPhone was available through the connected tooling. No native visual or successful return-journey claim is made. Remaining checks follow `docs/local-testing.md`: recent → detail; Dashboard period → filtered history; current/deleted list → Expense/Activity → edit/delete → Back; archive, live Category/member changes, loading/retry/unavailable, retained pages/scroll, long filenames, narrow widths, large text, light/dark, screen readers/focus and touch targets. These are the outstanding acceptance limits for task 6 and issue #155.
