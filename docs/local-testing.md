# Test the app locally

Humans and AI agents use the same workflow: PostgreSQL in Docker, the API in one terminal, and Expo in another. Data survives shutdown. Start with **First-time setup**, then use **Daily startup** on subsequent visits. Existing automated checks are in [local checks](local-checks.md); they are not prerequisites to opening the app.

## First-time setup

### 1. Install the tools

- Git, Node.js **24.11.1** and npm (matching CI). Confirm `node -v` before installing. If another Node is first on `PATH`, prepend the 24.11.1 install.
- Docker with Linux containers and `docker compose`. Docker Desktop is the usual local app; a cloud image may already be running the engine.
- For Android: [Android Studio, SDK and JDK setup](https://docs.expo.dev/get-started/set-up-your-environment/). Set `ANDROID_HOME` to your SDK and put its `platform-tools` on `PATH`. Start an emulator with a **Google Play** image in Android Studio's Device Manager; native Google sign-in needs Google Play services. `adb devices` must list it as `device`.
- For a physical iPhone: an Expo account, Apple Developer membership and the [iPhone instructions below](#physical-iphone).

Examples work in PowerShell and Bash unless labeled. Every command block names its working directory. Docker must be running before database commands.

### 2. Install the two projects

From the repository root:

```sh
npm ci --prefix api
npm ci --prefix mobile-app
```

Copy `api/.env.example` to `api/.env`, and `mobile-app/.env.example` to `mobile-app/.env.local`. Keep existing local files when returning to the repo; these ignored files hold your development settings. If a startup script already wrote `api/.env`, keep that file only when its `DATABASE_URL` is the Compose database below. Another port or database name is a different database.

### 3. Configure the API

Edit `api/.env`. Its example database URL matches the root Compose file: host `127.0.0.1`, port `55433`, database `spendeazy_disposable_manual`. The database's public development password is only for this loopback-bound local service.

Generate a value **twice**, independently, with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save one value as `INVITATION_CODE_ENCRYPTION_KEY` and the other as `GCASH_REFERENCE_HASH_KEY`. Retain both while retaining the database; do not regenerate them on normal startup.

Use a dedicated **Clerk development instance**. Copy its `sk_test_` secret key to `CLERK_SECRET_KEY` and its RSA PEM public verification key to `CLERK_JWT_KEY`. For a single-line PEM value, use literal `\n` between lines. Without Clerk configuration `/health` can work while authenticated requests fail. When those values are already in the environment, copy them into `api/.env`. Leave them empty when they are not.

Do not invent these values. Confirm with a developer when you do not have them.

### 4. Configure mobile sign-in and connectivity

Edit `mobile-app/.env.local`:

| Setting | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://10.0.2.2:3000` for the standard Android emulator |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_` key from the **same** Clerk instance as the API |
| `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` | Google web OAuth client ID for the same Clerk instance |
| `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client ID matching `com.seyfsasy.spendeazymobile` and the installed build's signing SHA-1 |
| iOS client ID and URL scheme | Required when building/testing iPhone; see below |

Copy public client IDs from the environment when they are already set. When the web client id is missing, take it from that instance's Google connection. If Google One Tap is enabled, the instance's public Frontend API environment includes it as `display_config.google_one_tap_client_id`.

For a local Android debug build, obtain the signing SHA-1 with `./gradlew signingReport` from `mobile-app/android/` (`.\gradlew.bat signingReport` in PowerShell). If that directory is absent, generate it first with `npx expo prebuild --platform android` from `mobile-app/`. `expo prebuild` and `expo run:android` create `mobile-app/android/app/debug.keystore` when the project has none. Reuse the debug keystore registered on the Android OAuth client, or register this build's SHA-1. A new keystore does not match a client registered for another machine.

Only public identifiers belong in `EXPO_PUBLIC_*`. Backend secret keys stay in `api/.env`.

Do not invent these values. Confirm with a developer when you do not have them.

## Daily startup

Before starting, check that `api/.env` points to the Compose database (`127.0.0.1:55433/spendeazy_disposable_manual` by default) and that the mobile API URL uses the API's `PORT` (`3000` by default). Existing local env files may still contain settings from an older setup. If something is already listening on the API port, stop that process when it was started against a different database.

### 1. Start PostgreSQL

From the repository root:

```sh
docker compose up -d --wait
```

Wait for PostgreSQL to be healthy. This starts the `spendeazy-manual` project and reuses its `manual-data` volume. It is separate from the disposable automated-test databases.

### 2. Start the API

In an API terminal, working directory `api/`:

```sh
npm run migration:run
npm run start:dev
```

Continue only after migrations succeed. Leave watch mode running. Open [health](http://localhost:3000/health) to verify connection status. The API base path is `/api/v1`; the mobile base URL is the origin without that path.

### 3. Open the native app

For Android, wait for the emulator before starting Expo. From the repository root, confirm the intended serial in `adb devices -l` is `device` and `adb -s <serial> shell getprop sys.boot_completed` prints `1`. The API health page should report the database as ready, and `EXPO_PUBLIC_API_BASE_URL` must use `http://10.0.2.2:<PORT>` with the API's `PORT`.

In a terminal at `mobile-app/`, use the installed development build:

```sh
npm run parser:prepare
npx expo start --dev-client --localhost
```

From the repository root, reverse Metro's default port to the emulator, then press `a` in the Expo terminal (`Shift+A` to choose a device):

```sh
adb -s <serial> reverse tcp:8081 tcp:8081
```

If Expo selects a different port, use it on both sides of the reverse command. This reverse is for Metro only; the API stays on `10.0.2.2:<PORT>`. For a physical iPhone, use the LAN/HTTPS setup below instead of this Android path.

If Expo reports no development build, or native dependencies/configuration changed, stop Metro and build/install instead:

```sh
npx expo run:android --device
```

Choose the intended device. Expo builds, installs and starts Metro. Parser preparation creates an ignored PDF.js module needed by the bundle, even if you are testing another screen. Expo Go cannot run this app's native Google integration.

If `a` times out while querying installed packages, wait until `adb devices` lists the emulator as `device` and `adb shell getprop sys.boot_completed` prints `1`, then retry. No installed development build means stop Metro and use the build command above. `npx expo run:android` can rewrite the `android` and `ios` scripts in `package.json` so they compile. Restore those scripts unless that change is intentional. `npm run android` and `npm run ios` open an installed build.

On a slow emulator the system or the app can report that it is not responding while the bundle downloads or the runtime starts. Choose **Wait**. The dev client can stay blank, with its gear visible, until the sign-in screen appears. Startup is complete when the sign-in screen or Dashboard is usable. Dashboard still requires the Google test account signed in on that device. A credential, consent, or MFA prompt is a human step; report that stop instead of a Dashboard pass.

If the dev-client connection drops, stop Metro, restart it with `--localhost`, and repeat the reverse using the port Expo reports.

Keep one Metro server for this checkout.

## Test the behavior

1. Sign out of Spendeazy if testing fresh sign-in. Sign in with the Google test account `spendeazytestuser@gmail.com`; complete any credential/consent/MFA prompt (requires human verification). Wait until Dashboard and Personal Space have loaded and remain usable.
2. Test the changed feature with fictional or provided test data. For example, create a manual Expense and find it in the list/detail screen; exercise retry or cancellation when relevant.
3. For session/storage changes, stop the app process and reopen it **without clearing app data**. Confirm the expected session and Space are retained. On Android, `adb -s <serial> shell am force-stop com.seyfsasy.spendeazymobile`, then reopen from the launcher. Keep Metro running for a development build.
4. Exercise sign-out, API unavailable/retry, background/foreground, keyboard/back and accessibility as relevant to the change.

For Expense correction/history, also verify:

- Edit manual and imported Expenses in Personal and an active writable Shared Space. Check Activity snapshots and current actor/Category labels; confirm Added By, Space, source and import/source-row provenance stay unchanged. An unchanged inactive Category may remain; reassignment requires an active Category.
- Open one Expense in two clients, save one edit, then try the stale edit. Confirm the draft remains and the latest version must be reviewed before resubmitting.
- Delete an Expense. Confirm active count and amount exclude it, Deleted Expenses retains its detail and Activity, and deleted detail has no Edit, Delete or restore action.

Record the revision (and whether edited), device/OS, native build/profile, steps, and observed result. A healthy API, installed build or briefly visible screen is not a completed test. Agents can interact with the emulator using ADB commands or computer-use tools when available. Agents use the same commands and device controls; report unavailable device access or an actual credential challenge instead of claiming a pass. Keep tokens, account identifiers, statements and private screenshots out of reports.

## After changing code or configuration

| Change | Action |
| --- | --- |
| JavaScript/TypeScript UI or logic | Fast Refresh; press `r` in Expo for a full reload when needed |
| Mobile API URL or publishable key in `.env.local` | Full reload; no native rebuild needed for these JavaScript values |
| API source | Nest watch restarts it |
| API `.env` | Stop and restart `npm run start:dev` |
| Database migrations | Stop API, run `npm run migration:run`, restart API |
| Project dependencies | Run `npm ci` in the changed project; rebuild mobile when native dependencies changed |
| Native dependencies, plugins or native app settings | Stop Metro; in `mobile-app/`, run `npx expo prebuild --clean`, then `npx expo run:android --device` (or rebuild with EAS for iPhone) |
| Parser implementation/assets | Run `npm run parser:prepare`, then reload |

`prebuild --clean` replaces the ignored generated native projects. Keep native changes in app config/plugins. Ordinary JS edits do not need native regeneration or cache clearing. [Expo environment behavior](https://docs.expo.dev/guides/environment-variables/), [native generation](https://docs.expo.dev/workflow/continuous-native-generation/).

## Physical devices

### Physical iPhone

From Windows, use EAS cloud builds; local iOS builds/simulator require macOS and Xcode. Configure the Google iOS client ID and reversed-client-ID URL scheme from `.env.example`. Put the same public Clerk/Google build settings in the EAS **development** environment so the remote config plugin receives the iOS URL scheme. Local `.env.local` still configures the Metro-served JavaScript; a gitignored file is not automatically available to the remote build. [EAS environment setup](https://docs.expo.dev/eas/environment-variables/manage/).

From `mobile-app/`:

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --profile development --platform ios
```

Install the build on the registered iPhone, enable Developer Mode when prompted, run `npm run parser:prepare` and `npx expo start --dev-client`, and open the development server from the device. Use a LAN/HTTPS API URL reachable by the iPhone. Native configuration changes require another build. [Internal distribution](https://docs.expo.dev/build/internal-distribution/).

For milestone checks without Metro, use the existing EAS `preview` profile, configuring its build environment for the dedicated development backend. Android/iPhone device acceptance and the parser limits/device/cleanup work in [#138](https://github.com/yororo/spendeazy/issues/138) remain separate release checks.

## Shutdown and reset

Stop Expo and Nest with Ctrl+C in their terminals. From the repository root:

```sh
docker compose stop
```

Data and keys remain available for the next session. `docker compose down` also removes containers/network while retaining the named database volume.

**Reset only when you want to delete all data in this manual database.** Stop the API, then from the repository root:

```sh
docker compose down --volumes
docker compose up -d --wait
```

Run migrations and restart the API using Daily startup. Keep your API keys; resetting PostgreSQL does not sign the device out of Clerk. Sign out/in to exercise fresh User provisioning against the empty database. Optional synthetic fixtures are described in [API seed/reset](../api/README.md#development-seedreset); they do not populate the real Google identity's Personal Space.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Docker unavailable/database not healthy | Start Docker Desktop in Linux-container mode; from root, `docker compose ps` and `docker compose logs postgres` |
| Database connection refused | Confirm Compose is healthy and `api/.env` uses port `55433`; run API commands from `api/` |
| Missing encryption/hash key | Fill both independent 64-hex-character values in `api/.env`; retain them with the data |
| API health works, private requests fail | Confirm matching development Clerk keys, Google setup, and completed sign-in; see [API auth troubleshooting](../api/docs/LOCAL_TESTING.md) |
| Google configuration/developer error | Check web/native client IDs, Android package/signing SHA-1 or iOS bundle/URL scheme against the installed build |
| Host API works, device cannot connect | Check device-specific API URL, API terminal and firewall; try Android USB reverse |
| App cannot connect to Metro | Confirm the intended development build/server, LAN or USB connectivity, and Expo's displayed port. If the bundle downloaded and the dev connection then failed, use Metro `--localhost` and `adb reverse` for that port |
| Expo times out querying packages | Wait until the emulator has finished booting, then retry. No development build means `npx expo run:android --device` |
| App or system is not responding on first open | Choose **Wait**. Software emulation can stall during download and startup; the sign-in screen can appear after a blank dev-client screen |
| Sign-in stays on "Signing in" with no Google UI | Add the Google test account on the device, or register this build's debug SHA-1 on the Android OAuth client |
| `npm run android` starts a native compile | `expo run:android` rewrote `package.json` scripts; restore them |
| Old verification stack still running | Stop it from its original checkout before switching workflows; the new Compose project does not adopt or remove old runs |
| Old configuration | Remove stale exported environment overrides; full reload mobile, restart API after API env changes |
| Missing generated parser module | In `mobile-app/`, run `npm run parser:prepare`, then reload |
| API cannot bind a free-looking port (`EACCES` on Windows) | Windows may reserve the port; choose another API `PORT` (for example `3307`) and update the mobile API URL to match |
| Busy API/Metro/database port | Stop only the instance you recognize, or select another port; do not kill unrelated listeners |

Alternative ports: set `PORT` in `api/.env` and update the mobile URL/reverse rule; use Expo `--port 8082` for Metro. For PostgreSQL set `SPENDEAZY_MANUAL_DB_PORT` in the shell (`$env:SPENDEAZY_MANUAL_DB_PORT='55434'` in PowerShell, `export SPENDEAZY_MANUAL_DB_PORT=55434` in Bash), rerun Compose, and match the port in `DATABASE_URL`. For concurrent checkouts use a distinct `docker compose -p <name>` project and ports consistently for startup/shutdown/reset. One shared emulator install can only run one checkout's app at a time.
