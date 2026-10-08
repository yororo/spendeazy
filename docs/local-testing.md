# Local synthetic testing

The local test launcher starts the real Spendeazy web app and API against a dedicated PostgreSQL container. It uses fictional identities and temporary session credentials; it does not use Clerk or ordinary development database settings.

## Prerequisites

- Node.js 24 and npm
- Docker Desktop with Docker Compose available as `docker compose`
- Dependencies installed in both projects (`npm ci` from `api/` and `web/`)
- Microsoft Edge installed for Playwright (`npm --prefix web exec playwright install msedge` from the repository root)

## Cloud boot environment

Cursor Cloud machines boot Node.js 24.11.1, Docker, and the credential-free synthetic stack. PostgreSQL listens on `127.0.0.1:55432`, API health on `http://127.0.0.1:3100/health`, and web on `http://127.0.0.1:5174`. Synthetic sessions need no Clerk credentials; ordinary API/web development commands still require their `.env.example` settings.

The boot script preserves an already-ready stack. A second manual launcher exits if any of those ports is occupied; stop the existing stack before replacing it. The completion command remains the unfiltered `node scripts/local-test-launcher.mjs --e2e` from root.

## Start the manual environment

From the repository root:

```powershell
node .\scripts\local-test-launcher.mjs
```

The launcher checks the three loopback ports before starting, starts PostgreSQL, validates and migrates the dedicated database, starts the API and web server on loopback, and opens the browser at `http://127.0.0.1:5174/`.

The synthetic sessions use the normal authentication guard, User provisioning service, self-scoped HTTP client, and PostgreSQL stores. The browser shows a `LOCAL TEST` panel so this mode is unmistakable. The panel can select the populated User, a second populated User with distinct fictional data, or a fresh User. Selecting `New User` always creates a new synthetic identity and exercises real first-time provisioning, including Default Category creation.

On the first startup, the launcher migrates the empty dedicated database and creates two small fictional current-month scenarios: Categories, monthly Budgets, Category Rules, and manual Transactions whose descriptions are marked as demo or fixture data. Subsequent ordinary startups detect both local-test Users and only run migrations; they preserve manual edits and newly created data. A database retained from the previous one-User fixture is upgraded by adding only the missing second fictional User; the existing User's data is not overwritten.

Press `Ctrl+C` to stop the API and web processes and remove the PostgreSQL container. The named database volume is retained for ordinary manual restarts. If a port is already occupied, the launcher reports the exact loopback port and exits without attaching to or stopping the unrelated process.

## Reset the manual fixtures

Stop the running manual environment first, then run this explicit reset command from the repository root:

```powershell
node .\scripts\local-test-launcher.mjs --reset
```

The launcher-owned database is validated before the reset begins. The reset drops only that exact loopback PostgreSQL database, reruns migrations, restores the fictional fixture scenario, and starts the manual environment again. It rejects missing launcher markers, non-loopback hosts, ordinary development credentials, and other database names before any destructive operation. A normal startup never performs this reset.

If a retained database was created by an earlier local-test version and contains the fixed User without this fixture scenario, use this explicit reset once; ordinary startup leaves existing data untouched rather than guessing whether it is safe to merge fixtures.

The panel also has `Sign out`, `Expire token`, and `Revoke session` controls, plus a visible session-state indicator. Sign out redirects protected routes to the local signed-out page, where the last usable synthetic session can be entered again.

`Expire token` calls the real local session-control API, replaces the browser session with a server-issued expired token, and lets the normal API client observe the resulting `401 UNAUTHENTICATED`. The client makes one coalesced cache-bypassing token request, retries with the replacement session, and returns the panel to `Active session`. `Revoke session` first invalidates the current server-side session, then leaves the revoked token in place long enough for the next authenticated request to receive a real `401`; refresh returns no token, private query data is cleared, and the browser returns to the signed-out page. The resume action uses a separate temporary session, so the revoked credential cannot regain access.

## Run the isolated browser suite

The automated mode creates a new run ID, PostgreSQL project, database name,
database user/password, volume, and loopback ports for every invocation:

```powershell
node .\scripts\local-test-launcher.mjs --e2e
```

It starts the same real browser/API/database path, runs the API's PostgreSQL
Statement Import rollback/duplicate tests and the Playwright browser suite,
and removes only that run's Compose project and database volume when
finished, including after a test failure. It never removes the persistent
manual volume or an unrelated Compose project. A port or readiness failure is
reported and returns a failing exit status.

The rollback tests receive only the launcher's disposable database URL through
`TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL`. They run before browser tests,
create their own Users/Spaces, and remove their test records and failure trigger.
This keeps atomic confirmation protection active rather than silently skipped
by the default API suite.

`web/e2e/spending-journey.spec.ts` joins the feature acceptance tests into one
Personal Space journey at 390px and 1440px: real encrypted PDF unlock,
individual Remember, bulk assignment, exclusion/re-inclusion, read-only Review,
confirmation, statement-scoped Transactions across two months, restoration of
the prior Reporting Period, Insights Transaction/Budget actions and return,
keyboard chart details, and repeated-file confirmation rejection. Its committed
fictional PDFs and reconciliation ledger live in `web/e2e/fixtures/`.

The automated clock is fixed at `2026-09-19T12:00:00.000Z` by default. Set
`SPENDEAZY_E2E_TEST_CLOCK` to another explicit ISO-8601 UTC timestamp when
debugging; the launcher derives the transaction date and browser reporting
period from that value. No scenario depends on the host's current date.

### Focused browser diagnostics

Use explicit diagnostic mode to select exact specs relative to `web/` and/or a
Playwright test-title regular expression:

```powershell
node scripts/local-test-launcher.mjs --e2e --diagnostic --spec e2e/local-test.spec.ts
node scripts/local-test-launcher.mjs --e2e --diagnostic --spec e2e/local-test.spec.ts --spec e2e/mobile-date-fields.spec.ts
node scripts/local-test-launcher.mjs --e2e --diagnostic --grep 'first-time provisioning'
node scripts/local-test-launcher.mjs --e2e --diagnostic --spec e2e/local-test.spec.ts --grep 'provisions|first-time'
node scripts/local-test-launcher.mjs --help
npm --prefix web run typecheck:e2e
```

Repeated specs form a union; the title pattern narrows that union. A title
pattern alone searches the acceptance tree. Selectors require `--e2e
--diagnostic`; diagnostics require at least one selector and cannot combine
with manual/reset mode, CI or sharding. Missing values, malformed patterns,
unknown arguments, non-spec files and paths outside `web/e2e/` fail before
service startup. A valid selection with no tests fails when Playwright
discovers the suite. Browser failures and empty selections return a nonzero
launcher status.

Diagnostics use the same disposable PostgreSQL, real API, first-time User
provisioning, fixed clock, readiness checks and required rollback/duplicate
tests. Success, failure and supported Ctrl+C/SIGTERM interruption stop only
the run's processes and remove its database volume. Forced operating-system
termination cannot guarantee cleanup. Screenshots on failure and first-retry
traces remain under each unique run directory; use the existing bounded
`SPENDEAZY_E2E_WORKERS` option (1 or 2, default 1).

Reports record `classification` (`full-acceptance`, `ci-shard`, or
`diagnostic`), effective `selectors` and `selectionComplete`. Diagnostic
artifacts live under `web/e2e-reports/diagnostic/<run-id>/`. Console output
identifies their scope. Diagnostic, contradictory and historical unclassified
reports remain readable but cannot satisfy full acceptance or timing comparison
validation. Use the ordinary unfiltered `--e2e` command for completion.

`typecheck:e2e` strictly checks all maintained `e2e/**/*.ts` specs/helpers and
`playwright.config.ts` with no emitted output. It needs only web dependencies,
without Docker, Edge, services or credentials. Test sources stay separate from
the application build. Both required browser CI shards run the compiler before
browser installation and service startup; compiler errors fail the aggregate
validation gate with their original diagnostics.

### E2E scenario contract

Every `--e2e` run starts with an empty database: no populated User, fixture Transaction, or Shared Space. Test-created data is deterministic, fictional, and owned by the run. Provisioning and Default Category creation remain real first-time checks. A User provisioned by
the test has exactly one active Personal Space until two eligible Users complete
the Invite Code flow: create a code, save a claim with the code, then explicitly
accept the claim. Tests that need a Shared Space must establish it within the
test (or a clearly named setup helper) and must not rely on manual-mode
fixtures, another test's data, or Playwright worker order.

Keep the assertion focused on the behavior being tested: Personal Space
provisioning should assert the Personal Space and Default Categories, while a
Shared Space journey should assert the completed invitation lifecycle before
using its Space ID.

The suite defaults to one worker. Set `SPENDEAZY_E2E_WORKERS=2` to benchmark
bounded concurrency; other values fail configuration. Financial scenarios use
fresh server-issued Users, and the remaining named-User stale-cache fixture
cleans up its own Transaction. A test that creates lasting data for a named User
must clean up or use a fresh User when assertions need an empty Personal Space
or no active Shared Space. New tabs and full-page navigation restart the local
synthetic session at the fixed initial User: saved browser authentication state
does not preserve a fresh identity. Run the full launcher after changing tests:
running one spec alone cannot expose interactions with other specs.

CI distributes the suite across two jobs, each with its own launcher-owned
database, API, web server, and session secret. Each shard retains one worker;
scenarios distribute independently between shards. To reproduce a shard:

```powershell
$env:SPENDEAZY_E2E_SHARD = '1/2'
node scripts/local-test-launcher.mjs --e2e
Remove-Item Env:SPENDEAZY_E2E_SHARD
```

Use `2/2` for the second shard. Without this variable the launcher runs all
tests, which remains the required local completion check. CI saves HTML/blob
reports and failure screenshots/traces for seven days. Reports live under
`web/e2e-reports/<shard>/<run-id>/`: Playwright JSON records per-test attempts,
durations, retries and skips; `launcher.json` records infrastructure startup,
API checks, browser execution, teardown and total wall time. Test artifacts,
HTML and blob reports share that unique run directory, preventing concurrent
test or shard runs from overwriting diagnostics. Successful diagnostic captures
are opt-in with `SPENDEAZY_E2E_SCREENSHOTS=1`; their observable rendering,
contrast and containment assertions still run by default.

Summarize run/shard timing and the slowest tests:

```powershell
node scripts/e2e-timing-summary.mjs web/e2e-reports
```

For a matched benchmark, retain at least three full-run report directories per
configuration in separate before/after directories, on the same host class with
the same browser, clock, reporter settings and disposable database initialization.
The comparison rejects missing reports, failures, skips, inconsistent clock or
worker settings, and savings accompanied by increased retries or flaky tests:

```powershell
node scripts/e2e-timing-summary.mjs --compare <before-directory> <after-directory>
```

Coverage preservation requirements are recorded in [issue #110](https://github.com/yororo/spendeazy/issues/110).
Settings acceptance owns the exhaustive live preference matrix; financial
journeys retain targeted cross-tab transitions in fragile workflow states.
Sharing and spending presentation run at 390/1440px with shorter populated
surface and navigation checks at 320px, 767/768px and 1023/1024px. The encrypted
password dialog also retains 320px containment within the mobile journey.

To run Playwright against an already-running dedicated environment, run
`npm run test:e2e` from `web/` with `SPENDEAZY_E2E_BASE_URL`,
`SPENDEAZY_E2E_API_BASE_URL`, `SPENDEAZY_E2E_TEST_DATE`,
`SPENDEAZY_E2E_TEST_CLOCK`, and `VITE_LOCAL_TEST_SESSION_TOKEN` set to that
environment's loopback URLs, fixed clock/date, and temporary token.

The browser suite creates a fresh User, switches Users, verifies sign-out/re-entry, observes bounded expiration recovery and revocation failure, checks that expired and revoked credentials are rejected directly by the API while replacement credentials work, and makes direct authenticated API requests to prove that cross-User reads and mutations remain blocked.

The `--e2e` API process injects a deterministic Category Suggestion evaluator at the API's Jev integration boundary. It returns the test Category for eligible imports, simulates an unavailable service for one fixture description, and leaves another fixture request pending so the browser can prove the active Category selector still works. The normal API entrypoint and manual local-test environment do not register this evaluator, and the stub stores no suggestion or acceptance data.

## Run the full CI validation locally

After installing dependencies and a Playwright browser, the checks used by
`.github/workflows/ci.yml` can be run from the repository root:

```powershell
npm --prefix api run lint
npm --prefix api run build
npm --prefix api run test:migration-image
npm --prefix api test -- --runInBand
npm --prefix api run openapi:check
npm --prefix web run lint
npm --prefix web run build
npm --prefix web run typecheck:e2e
npm --prefix web test -- --run
npm --prefix web exec playwright install --with-deps msedge
node scripts/verify-release-gates.mjs
node --test scripts/release-plan.test.mjs
node .\scripts\local-test-launcher.mjs --e2e
```

The CI workflow runs this same project validation and isolated browser suite
on GitHub-hosted Linux without Clerk credentials or external authentication.
The real Clerk sign-in flow remains separate coverage. API PostgreSQL suites
under `api/test/` that require their own `TEST_*_DATABASE_URL` variables are
not silently pointed at the local-test database; the browser suite is the
credential-free real-service integration boundary for this workflow.

## Security boundary

The dedicated API entrypoint requires `NODE_ENV=test`, a launcher marker, the exact loopback database credentials/name, and a short-lived signed synthetic session token. It accepts only the two named fictional identities or fresh IDs minted by the local session controller; missing, malformed, expired, revoked, or caller-invented identity values are rejected. The controller accepts a scenario name rather than an internal User ID and is registered only by the local entrypoint. The normal API entrypoint never registers the synthetic providers or controller, and production module composition rejects an attempt to inject synthetic authentication.

The production API build copies only `api/src` into its artifact. The local API entrypoint and providers live under `api/local-test`; the local web entrypoint and panel live under `web/local-test`, outside the normal Vite/TypeScript build entrypoints.
