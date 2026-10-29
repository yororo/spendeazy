# IP-03 / issue #150 verification

Recorded 2026-10-29. Tasks 06 and 08 are implemented; task 07's automated checks and available Android journeys were executed. **Required native acceptance remains partial**, with the outstanding cases below. No commit, push or PR was created under the implement-task skill.

## Revisions and environment

- App/API checkout: `443e878d79eb3bd39d8e0412993ed68ee4d734e5`, with the pre-existing staged tasks 03–05 and this session's tasks 06–08 changes. Tests ran against that combined working tree. API runtime process revision was not independently pinned; native smoke observations used the existing local development session, not the automated databases.
- Windows host, Node `v24.11.1`. Android `emulator-5554`, Pixel_10 AVD / `sdk_gphone16k_x86_64`, Android 17, development app `com.seyfsasy.spendeazymobile` 1.0.0 (versionCode 1, minSdk 24 / targetSdk 36). Metro listened on localhost 8081, API on 4000. Device was 1080×2424 physical pixels at 420 dpi, font scale 1.0 (approximately 411 logical units wide).
- Automated PostgreSQL: newly created `postgres:16-alpine` container `spendeazy-ip03-verification`, loopback `127.0.0.1:55439`. Ten newly created databases `ip03_suite_0` through `ip03_suite_9`, one for each variable in `api/scripts/run-required-postgres-tests.mjs`, in its declared order. Historical migration had its own empty database; Dashboard used `ip03_suite_9`. The retained manual database on 55433 was not used by automated suites. Container removed after verification.
- PostgreSQL financial fixtures are fictional and supplied by the checked-in suites. HTTP tests use their injected `MANILA_CLOCK`, including immediately before/at `2026-12-31T16:00:00Z`. The native session used the real Manila date, October 29, 2026; no device clock, stored Expenses, Budgets or configuration was changed.
- Initial sandboxed Docker/ADB checks could not connect; permitted local-engine/device access succeeded. No physical iPhone was connected. Screenshots were inspected locally and excluded from Git because the native session was not a controlled sanitized fixture session.

## Executed automated checks

All commands below passed; none of the database tests skipped.

| Working directory | Command | Result |
| --- | --- | --- |
| `mobile-app/` | `npm run lint` | Passed |
| `mobile-app/` | `npm run typecheck` | Passed |
| `mobile-app/` | `npm test` | 133 passed, 0 failed/skipped |
| `mobile-app/` | `node --test src/features/dashboard/dashboard-charts.test.mjs` | 2 passed after final fixture consistency edit |
| `api/` | `npm test -- --runInBand --runTestsByPath src/reporting/application/dashboard-report.service.spec.ts` | 15 passed |
| `api/` | `npm test -- --runInBand` | 50 suites / 261 tests passed |
| `api/` | `npm run build` | Passed |
| `api/` | `npx eslint "{src,apps,libs,test}/**/*.ts"` | Passed, read-only |
| `api/` | `npm run openapi:check` | Passed; no contract change/regeneration |
| `api/` | `npm run test:e2e -- --runInBand --runTestsByPath test/dashboard-reporting-http-postgres.e2e-spec.ts` | 9 passed using explicit isolated Dashboard URL |
| `api/` | `npm run test:postgres` | 19 suites / 88 tests passed using all ten distinct URLs |
| Repository | `git diff --check` | Passed |

Reproduce database setup with a dedicated loopback PostgreSQL 16 container, create ten empty databases, and set the ten `TEST_*_DATABASE_URL` variables from the runner to those distinct targets before the commands above. Never substitute the retained manual database. No credentials are needed from the native session for these tests.

## Financial and state matrix

| Acceptance area | Evidence and remaining limit |
| --- | --- |
| Mixed Monthly/annual planning, annual-only 1,000, final half-up rounding | Passing service + HTTP/PostgreSQL fixtures; native controlled-value acceptance pending |
| 319.99 / 320.00 / 400.00 / 400.01 against 400.00; equality not a Monthly breach | Passing service/database fixtures and mobile exact amount/meter format tests; native nonempty Budget rows pending |
| January YTD, past year, exact Manila New Year, confirmation bounds, future rejection | Passing service/database/controller cases; native January zero bar and past December observed, native injected-clock resume pending |
| Current configuration edits/removal/deactivation/reactivation | Passing HTTP/PostgreSQL commands and re-query assertions; native edit/return pending |
| Inactive/unbudgeted actuals, deleted exclusion, highest tie/identity ordering | Passing server cases; native controlled historical/deleted/tie fixtures pending |
| Category filtering leaves Summary, totals, checks and imports unchanged | Passing HTTP/controller cases; native full monthly breakdown visibly included Categories outside the three selected line series |
| Confirmation-time imports unaffected by Expense edits/deletion | Passing HTTP fixtures; native count/history journey used zero imports, nonzero committed-import acceptance pending |
| Zero/empty report and Space isolation | Passing server/controller cases. Native no-plan, zero bars and empty past year observed. Delayed native Space/identity requests and archived-Space journeys pending |
| Complete chart disclosures and filters | Two rendered interaction regressions cover zero bar, complete breakdown, current partial-month Category/all filters, period totals and supplied Monthly/annual references. Native observations below supplement these tests |

The interaction regression harness renders the real chart/view components with native primitives replaced by test hosts. It exercises callbacks and exact supplied filters, including 2× text-scale column sizing; it does not establish native touch, scrolling, layout or screen-reader acceptance. Existing react-test-renderer deprecation and Node module-type warnings remain non-failing.

## Observed Android journeys

Used ADB UI hierarchy inspection, input taps/swipes, native Back and local screenshots in the already authenticated app. Re-reading the hierarchy after actions verified destinations and positions. This is limited integration smoke evidence against the existing API/persistence session, not independent fixture-backed financial acceptance.

| Origin / interaction | Observed result |
| --- | --- |
| Actual spending | Expenses displayed `2026-01-01 – 2026-10-29` with no Category; Back returned |
| Expense count | Same full report dates and no Category; Back returned |
| Highest Category | Full report dates plus the supplied highest Category; Back returned |
| January zero bar | Opened January 2026 sheet with `2026-01-01–2026-01-31`, ₱0.00 and 0 Expenses; all-Category breakdown included Categories outside the three line selections |
| Monthly disclosure, all Expenses | Expenses displayed January 1–31 with no Category; Back retained monthly chart vertical position |
| Monthly breakdown Category | Current October Category absent from selected line series opened Expenses with October 1–29 and that Category |
| Current partial month | Horizontal plot swipe reached October; activation showed October 1–29, In progress, exact total/count and complete breakdown |
| Category chart month | January sheet showed exact selected-Category values and No Monthly limit; Category Expenses action displayed January 1–31 plus selected Category |
| Back restoration | Category spending heading returned at bounds `[113,625][456,682]`, unchanged from before navigation. Three selected chips and monthly/category chart positions persisted; the monthly chart's horizontal offset also survived later navigation |
| Past year | Selected 2025; report displayed January 1–December 31. Scrolled plot to December; sheet and Expenses both used December 1–31. No In progress label |
| Import count | Opened Statement Import history for selected Space, with the existing unfiltered-history behavior; zero-import empty state displayed; Back returned |
| Dismissal/background | Detail sheets exposed close and backdrop actions. The January modal hierarchy contained sheet controls rather than underlying Dashboard controls; Android Back closed details during smoke work. Spoken focus/background behavior remains pending |

## Design and outstanding native acceptance

Inspected `VvvB3`, `U0W2qG` and `bqcvI` through Pencil and resolved the named Yearly source nodes. A local light-mode Android screenshot showed the source's Outfit hierarchy, rounded glass cards, lavender/teal wash, Summary split and Budget-check sections. This was a scrolled no-plan/empty-Budget state, so it does not establish nonempty chart/meter parity. The screenshot also shows content passing beneath the transparent status/tab areas during scrolling; comprehensive safe-area/overlap assessment remains pending.

The implementation intentionally uses PHP, real YTD/twelve-month ranges, 48-unit hit columns, native sheets, explicit Expenses/configuration actions, stable Category markers and scalable text. These increase height/scrolling compared with the compact six-month/USD illustration. Category point activation uses one aligned month column opening all visible Category values, avoiding ambiguous overlapping 48-unit targets at coincident points. Dark uses existing slate surfaces and brighter semantic colors; no dark source board exists.

| Pending area | Concrete gap / next acceptance setup |
| --- | --- |
| Physical iPhone / VoiceOver | No connected physical iPhone; install development build with the runbook and repeat every journey |
| TalkBack / focus | No human spoken-focus run; verify announcement order, selected/count state, background exclusion and return focus after close/backdrop/Back on both platforms |
| Budget destinations / meters | Existing native Space had no active Budgets. Load a controlled fictional Monthly/annual fixture to verify all statuses, denominators, overage geometry, frequency configuration, annual Expenses/configuration distinction and edit/return |
| Category period-total destination | Automated exact filter assertion passed; native action/Back still pending |
| Current-month all-Expenses action | Current sheet and a Category action observed; all-Expenses action verified for January/December and automated October, native October all-Expenses still pending |
| Refresh, loading, error/retry and mode memory | Controller/adapter coverage passed and prior task 02 has limited mode-memory evidence; controlled native network failure/retry and full repeat sequence pending |
| Space/identity, archived Space and rollover | Automated cancellation/guard/rollover cases passed. Native delayed requests, archived restrictions, configuration return and injected-clock foreground/New Year setup still required |
| Native financial/import values | Use sanitized persistence-backed fixtures and documented test clock; current session was not seeded for independent expected/actual verification. Reuse committed-import fixtures; do not add production import workflows |
| Light/dark/System, 320/360/390 widths, landscape, large text | Only current light portrait/default scale observed. Configure remaining layouts, theme/reduced-motion and fallback/contrast checks on both platforms, then capture sanitized evidence |

Issue acceptance remains pending until these required native checks have evidence. Owning interaction/source/dark-adaptation documentation is in `mobile-app/design/design-token.md`; server behavior remains defined by `api/docs/openapi.yaml`.
