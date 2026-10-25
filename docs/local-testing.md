# Local API and native testing

The supported automated delivery checks cover the API against PostgreSQL and the native mobile project independently. The retired browser application and its browser acceptance suite are no longer built or used as release gates. Native-device acceptance remains a separate product gate.

## Prerequisites

- Node.js 24 and npm
- Docker Desktop with Docker Compose (`docker compose`) for PostgreSQL integration tests
- Dependencies installed in `api/` and `mobile-app/` with `npm ci`

## Cloud boot environment

There is no browser/API synthetic acceptance stack to start. The root API PostgreSQL launcher creates a uniquely named Compose project, a disposable database volume, and a loopback port for one run. It removes only those resources at exit. Do not replace a separately managed local service when running this command.

## Run a disposable API for manual testing

With Docker Desktop running Linux containers, Docker Compose v2 and Bash (Git Bash
on Windows, or Bash on Linux/macOS), run from the repository root:

```bash
bash scripts/run-disposable-api.sh
```

No host Node.js installation, npm install or `.env` file is needed. The launcher
builds the API image, generates independent ephemeral database credentials and
encryption/HMAC keys, starts PostgreSQL with an in-memory data directory, applies
compiled migrations and waits for API health. It prints the API, health and Swagger
URLs using a randomly assigned loopback port. Docker needs internet access on the
first run to download images and npm dependencies, plus enough memory for PostgreSQL
and the API build.

For authenticated requests, export `CLERK_JWT_KEY` and `CLERK_SECRET_KEY`
from a dedicated development Clerk instance before
launching. Use a one-line PEM public key with literal `\n` separators. Send a short-lived development session
token as `Authorization: Bearer <token>`. Keep these values out of source control
and chat. Without Clerk configuration, use the public health and documentation
routes. The launcher does not read `api/.env` or seed users/data.

Keep the terminal open; Ctrl+C removes that run's containers, network, data and
tagged API image. Repeated or concurrent invocations create independent fresh
stacks without changing other services. Docker build caches and downloaded base
images remain reusable. Cleanup runs on normal exit, startup failure, SIGINT and
SIGTERM; SIGKILL, terminal crashes or Docker daemon failure can prevent cleanup.
For such interrupted runs, find the project with `docker compose ls --all`, then
run `docker compose -p <exact-project-name> -f local-test/disposable-api.compose.yml
down --volumes` and `docker image rm <exact-project-name>:local` from the repository
root. The project names begin with `spendeazy-disposable-`. All database contents
are temporary; this launcher is for manual testing, separate from the required suite.

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

The mobile application is still a starter and parser proof; it has no authenticated API adapter or sign-in flow. Its `EXPO_PUBLIC_API_BASE_URL` setting is only endpoint configuration, not evidence that requests or authentication work. Follow [the mobile README](../mobile-app/README.md) for device URL examples and native build evidence. Use a dedicated development Clerk instance, real dedicated development identities and a dedicated disposable backend/database when exercising authenticated API behavior. Seed commands require an explicitly named loopback database; never run migration experiments against a normal, shared, or production database.

Record only sanitized outcomes, device/OS/build identifiers, counts and timings. Keep statements, passwords, session credentials, tokens, private screenshots and account identifiers local. Device evidence and the remaining parser limits/older-device/temporary-file work in [issue #138](https://github.com/yororo/spendeazy/issues/138) remain release gates. Lint, type checks and fixture tests do not establish device certification.

## Real Clerk API checks

Automated API suites use Clerk test doubles and isolated databases. For a focused real-authentication check against a dedicated development API, use [the API Clerk runbook](../api/docs/LOCAL_TESTING.md). Obtain a short-lived session token from a dedicated development identity; keep it out of source control and chat. The mobile app currently has no configured API integration.
