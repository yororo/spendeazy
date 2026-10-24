# Local API and native testing

The supported automated delivery checks cover the API against PostgreSQL and the native mobile project independently. The retired browser application and its browser acceptance suite are no longer built or used as release gates. Native-device acceptance remains a separate product gate.

## Prerequisites

- Node.js 24 and npm
- Docker Desktop with Docker Compose (`docker compose`) for PostgreSQL integration tests
- Dependencies installed in `api/` and `mobile-app/` with `npm ci`

## Cloud boot environment

There is no browser/API synthetic acceptance stack to start. The root API PostgreSQL launcher creates a uniquely named Compose project, a disposable database volume, and a loopback port for one run. It removes only those resources at exit. Do not replace a separately managed local service when running this command.

## Run the required isolated API/PostgreSQL suite

From the repository root:

```powershell
node .\scripts\local-test-launcher.mjs --api-postgres
```

The launcher starts PostgreSQL with random per-run credentials and a random available loopback port. It creates one empty database for each API integration suite plus a separate empty pre-Space database for the historical ownership migration test, supplies every required `TEST_*_DATABASE_URL`, and runs the unfiltered API HTTP/PostgreSQL Jest configuration. Missing or shared database URLs fail in `api/scripts/run-required-postgres-tests.mjs`; required suites cannot be counted as passing when skipped or pointed at the same schema. The launcher always removes its own container and volume, including after test failure or supported Ctrl+C/SIGTERM interruption. It does not inspect, reset, or stop another database or Compose project.

Run API checks separately as needed:

```powershell
npm --prefix api test -- --runInBand
npm --prefix api run build
npm --prefix api run openapi:check
npx --prefix api eslint "{src,apps,libs,test}/**/*.ts"
```

The read-only ESLint invocation avoids `npm run lint`, which applies fixes.

## Run mobile checks

From the repository root:

```powershell
npm --prefix mobile-app run lint
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run parser:test
```

These checks establish static code and local parser-fixture behavior. They do not establish that the app builds and works on supported native devices.

## Device acceptance and backend boundaries

The mobile application is still a starter and parser proof; it does not yet implement the accepted Expense journeys or an API adapter/base-URL configuration. Follow [the mobile README](../mobile-app/README.md) for Android emulator/native build and physical iPhone evidence. Use a dedicated development Clerk instance and a dedicated disposable backend/database when exercising authenticated API behavior. Never point `db:reset-seed` or migration experiments at a normal, shared, or production database; verify the complete `DATABASE_URL` target before any destructive reset.

Record only sanitized outcomes, device/OS/build identifiers, counts and timings. Keep statements, passwords, session credentials, tokens, private screenshots and account identifiers local. Device evidence and the remaining parser limits/older-device/temporary-file work in [issue #138](https://github.com/yororo/spendeazy/issues/138) remain release gates. Lint, type checks and fixture tests do not establish device certification.

## Real Clerk API checks

Automated API suites use Clerk test doubles and isolated databases. For a focused real-authentication check against a dedicated development API, use [the API Clerk runbook](../api/docs/LOCAL_TESTING.md). Obtain a short-lived session token from a dedicated development identity; keep it out of source control and chat. The mobile app currently has no configured API integration.
