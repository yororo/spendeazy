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
node .\scripts\native-verification.mjs launch
node .\scripts\native-verification.mjs reload
node .\scripts\native-verification.mjs stop
```

The API container uses the database container's network namespace, so the host reaches both through the published loopback ports. `start` reuses the one compatible live run for this checkout. `start --new` creates another run. Pass `--api-port` and `--database-port` to select loopback ports; a busy port fails and the existing listener stays in place. `attach --run <id>` succeeds only when the manifest schema and checkout match and the database container is still the owned one. A matching port or process id is not accepted on its own. `status --run <id>` reports `running`, `api-stopped`, or `stale` and does not change resources. `stop` and `stop --run <id>` remove a container, volume, network, or API image only after its id and ownership token still match the manifest. `replace-api` rebuilds the API image, replaces that container, and keeps the database.

The manifest records run identity, ports, source revision and fingerprint, runtime versions, and verified resource ids. `launch` fills `extensions.device`, `extensions.nativeBuild`, and `extensions.evidence`. Credentials and hashes of credentials are not written to the manifest or command output. If a start is interrupted, rerun `stop --run <id>` for that manifest; it ignores resources that no longer match.

## Launch the native build against that API

`launch` is the readiness step for an owned run. It selects the Android device, checks the running API, installs the app through Expo, and starts that run's Metro server. `reload` sends Expo's Metro reload message to the recorded server. The JSON result has `outcome` of `launched`, `reloaded`, `blocked`, or `failed`. `authenticatedJourneyCertified` is false. A launch is not an authenticated journey.

Export the development Clerk values before `start`, so the running API receives them. Export `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` before `launch`. The publishable key must be a development key (`pk_test_`) whose public instance matches the running API verification key. Optional: `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID`. `launch` sets `EXPO_NO_DOTENV=1` for Expo, so `mobile-app\.env.local` is not the running configuration. Editing `api\.env` or the run's secret file does not change an API that is already running. To apply different Clerk values, `stop` the run, export the values, and `start` again.

Windows host tools, in addition to the environment prerequisites:

- Android SDK at `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `SPENDEAZY_NV_ANDROID_SDK`
- `adb` on that SDK, or `SPENDEAZY_NV_ADB`
- A JDK on `PATH`, or `SPENDEAZY_NV_JAVA`
- One authorized emulator or device. Several attached devices need `--serial`. An unauthorized device needs the USB debugging approval; the command does not retry it
- Mobile dependencies installed with `npm ci --prefix mobile-app`

```powershell
node .\scripts\native-verification.mjs launch
node .\scripts\native-verification.mjs launch --serial emulator-5554 --metro-port 8081
node .\scripts\native-verification.mjs reload
node .\scripts\native-verification.mjs launch --boot-avd Pixel_7
```

`--boot-avd` starts that AVD only when nothing is attached. `SPENDEAZY_NV_EMULATOR_HEADLESS=1` adds a headless emulator launch. `SPENDEAZY_NV_BOOT_TIMEOUT_MS` bounds that wait. `SPENDEAZY_NV_METRO_PORT` and `--metro-port` select Metro; the default is 8081. A busy port that is not this run's Metro process is an error, and that process is left running. `SPENDEAZY_NV_DEVICE_API_HOST` or `--device-api-host` sets the host the device uses. Emulators try `10.0.2.2` first. When that alias is unreachable, `launch` adds one `adb reverse` for the owned API port and uses `http://127.0.0.1:<api-port>` on the device. An explicit host that fails is not replaced. `SPENDEAZY_NV_GRADLE_MAX_WORKERS`, `SPENDEAZY_NV_LAUNCH_TIMEOUT_MS`, and `SPENDEAZY_NV_BUNDLE_TIMEOUT_MS` bound the native build. `SPENDEAZY_NV_EXPO` and `SPENDEAZY_NV_EMULATOR` override those executables.

The result records the source revision and dirty-checkout fingerprint, API image id, native build fingerprint, device serial and ABI, Metro endpoint, and run id. The served bundle must contain the launch API address and publishable key. A recorded device, ABI, configuration, or installed build that does not match this launch is `identity-mismatch`; stop that run and start another rather than treating the old install as updated. `stop` ends the Metro process only when its command still belongs to that run, and removes only the `adb reverse` this launch added.

If `launch` stops before Metro is ready, read the run's `launch.log` under the state directory and run `launch` again after the reported prerequisite is fixed. `reload` requires the recorded Metro process and a running app process. It does not install a build and it does not open a deep link.

## Run an emulator journey

`journey` drives the launched app through Android's UI Automator accessibility tree. Select one definition with `--journey`. Definitions live in `scripts/native-journeys/<id>.mjs` and are the only place for screen selectors and expected text. The runner does not contain feature selectors. `SPENDEAZY_NV_JOURNEY_DIR` points at another directory when a fixture journey is under test. Adding or replacing a definition does not require a runner change.

```powershell
node .\scripts\native-verification.mjs journey --journey sign-in-visible
node .\scripts\native-verification.mjs resume --journey sign-in-visible
```

`sign-in-visible` waits until the signed-out screen shows Spendeazy and the Google sign-in control. It does not tap Google, and a pass does not certify an authenticated journey. `authenticatedJourneyCertified` stays false.

A definition exports `id`, a short `summary`, and `steps`. A step is `see` or `tap` with a `selector`, `log` with `source` (`metro`, `api`, or `device`) and `includes`, or `checkpoint` with a `reason`. Selectors match the accessibility node's `text`, `description` (Android content description, including React Native accessibility labels), or `resourceId`. Matches are exact. `timeoutMs` is bounded. `required: false` records a miss as skipped. A required assertion that is skipped, failed, blocked, or human-pending keeps `certified` false and the command exits 1.

Retire a journey by exporting `retired: { reason: '...' }` and deleting its steps. Running that id is `skipped` with the reason, exit 1. A missing file, a broken definition, or a selector that is no longer on screen is `journey-not-found`, `invalid-journey`, or a failed assertion. None of those are a pass. When the app has no accessibility text for a check, report a separate instrumentation task. Do not add a product hook in a journey change.

`checkpoint` stops the command with outcome `human-pending`. The person completes the credential or consent step. `resume` checks the checkout fingerprint, native configuration, installed build, API image, and device against the checkpoint and the recorded launch, then continues at the next step. A mismatch is `incompatible-resume` and does not certify the earlier steps. `journey` starts at the first step again and replaces a stored checkpoint.

The command reads bounded tails of the Metro `launch.log`, the owned API container log, and `adb logcat` from those processes' existing output. It also stores the latest UI dump. Raw captures stay under the run's `nv-captures/<attempt-id>/` directory in the state directory. That directory is gitignored. Reports name those files and do not inline them. Clerk keys, bearer tokens, and known run secrets are removed before a capture or the command output is written.

`extensions.evidence.journey` keeps the latest attempt and its source fingerprint. `matchesCurrentSource` is false when the checkout has moved. A stored pass is not a result for the new checkout.

The JSON result separates three claims. `softwareChecks` is `not-run` here. `buildInstallation` is the recorded launch fingerprint, and it does not by itself certify the screen. `uiAssertions` is the journey outcome. `certified` is true only when every required UI assertion passed. `identity` repeats the source fingerprint, API image, device, configuration fingerprint, native build fingerprint, and run id. A result from another run or configuration is not a result for this launch. Exit 0 is only `passed`. `failed`, `blocked`, `human-pending`, and `skipped` exit 1.

`SPENDEAZY_NV_JOURNEY_STEP_TIMEOUT_MS` (default 15000, maximum 120000) and `SPENDEAZY_NV_JOURNEY_POLL_MS` (default 500) bound waits. The journey uses `adb` UI Automator and `input tap`. It does not attach a debugger.

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
