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
tagged API image. That script treats an API exit as the end of the whole stack.
Repeated or concurrent invocations create independent fresh stacks without changing other services. Docker build caches and downloaded base
images remain reusable. Cleanup runs on normal exit, startup failure, SIGINT and
SIGTERM; SIGKILL, terminal crashes or Docker daemon failure can prevent cleanup.
For such interrupted runs, find the project with `docker compose ls --all`, then
run `docker compose -p <exact-project-name> -f local-test/disposable-api.compose.yml
down --volumes` and `docker image rm <exact-project-name>:local` from the repository
root. The project names begin with `spendeazy-disposable-`. All database contents
are temporary; this launcher is for manual testing, separate from the required suite.

## Managed native-verification environment

Use this when an agent needs an owned API and database that can be inspected, reused, and stopped without touching anything else. The API process can be rebuilt or replaced while the same database volume stays up. `scripts/run-disposable-api.sh` is a separate manual stack that deletes its data on exit; this command is the one later device and journey checks attach to.

Windows host prerequisites:

- Windows 10 or 11, with PowerShell, from the repository root
- Node.js 24.11.1 and Git on `PATH`
- Docker Desktop running Linux containers

The command does not modify `api\.env` or `%USERPROFILE%\.spendeazy\api.env`. Run-scoped configuration stays in the state directory. The nonsecret manifest is `%LOCALAPPDATA%\spendeazy\native-verification\runs\<run-id>\manifest.json`. On Linux and macOS the state directory is `~/.spendeazy/native-verification`. Override it with `SPENDEAZY_NATIVE_VERIFICATION_STATE` or `--state-dir`.

```powershell
node .\scripts\native-verification.mjs start
node .\scripts\native-verification.mjs status
node .\scripts\native-verification.mjs attach
node .\scripts\native-verification.mjs replace-api
node .\scripts\native-verification.mjs stop
```

The API container uses the database container's network namespace, so the host reaches both through the published loopback ports. `start` reuses the one compatible live run for this checkout. `start --new` creates another run. Pass `--api-port` and `--database-port` to select loopback ports; a busy port fails and the existing listener stays in place. `attach --run <id>` succeeds only when the manifest schema and checkout match and the database container is still the owned one. A matching port or process id is not accepted on its own. `status --run <id>` reports `running`, `api-stopped`, or `stale` and does not change resources. `stop` and `stop --run <id>` remove a container, volume, network, or API image only after its id and ownership token still match the manifest. `replace-api` rebuilds the API image, replaces that container, and keeps the database.

The manifest records run identity, ports, source revision and fingerprint, runtime versions, and verified resource ids. `extensions.device`, `extensions.nativeBuild`, and `extensions.evidence` are reserved for later checks. Credentials and hashes of credentials are not written to the manifest or command output. If a start is interrupted, rerun `stop --run <id>` for that manifest; it ignores resources that no longer match.

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
npm --prefix mobile-app test
```

The mobile CI job runs the same four commands. `npm test` is the existing application regression suite. Parser fixtures stay fictional. None of these commands sign in with Google, drive an emulator, or certify a native release. Android emulator and physical iPhone evidence stay outside this deterministic path.

## Device acceptance and backend boundaries

The mobile application is still a starter and parser proof; it has no authenticated API adapter or sign-in flow. Its `EXPO_PUBLIC_API_BASE_URL` setting is only endpoint configuration, not evidence that requests or authentication work. Follow [the mobile README](../mobile-app/README.md) for device URL examples and native build evidence. Use a dedicated development Clerk instance, real dedicated development identities and a dedicated disposable backend/database when exercising authenticated API behavior. Seed commands require an explicitly named loopback database; never run migration experiments against a normal, shared, or production database.

Record only sanitized outcomes, device/OS/build identifiers, counts and timings. Keep statements, passwords, session credentials, tokens, private screenshots and account identifiers local. Device evidence and the remaining parser limits/older-device/temporary-file work in [issue #138](https://github.com/yororo/spendeazy/issues/138) remain release gates. Lint, type checks and fixture tests do not establish device certification.

## Real Clerk API checks

Automated API suites use Clerk test doubles and isolated databases. For a focused real-authentication check against a dedicated development API, use [the API Clerk runbook](../api/docs/LOCAL_TESTING.md). Obtain a short-lived session token from a dedicated development identity; keep it out of source control and chat. The mobile app currently has no configured API integration.
