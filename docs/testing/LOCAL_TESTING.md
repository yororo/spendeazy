# Local Testing

This document guides the user and AI agents when setting up and running end-to-end manual tests locally.

Humans and AI agents use the same workflow:

1. Run PostgreSQL in Docker.
2. Run the API in a separate terminal.
3. Run android emulator device in a separate terminal
4. Run Expo in another terminal.

The database retains data after shutdown.

All commands use Bash. Each command block starts with `# cwd:` to identify its working directory relative to the repository root.

## Defaults

These values are defaults. Check the `.env` or `.env.local` files for current values.

| Item | Value |
| --- | --- |
| API port | `3000` (`PORT` in `api/.env.local`) |
| API URL from Android emulator | `http://10.0.2.2:3000` |
| Metro port | `8081` |
| PostgreSQL | `127.0.0.1:55433`, database `spendeazy_disposable_manual` (root `compose.yaml`) |
| Android emulator AVD | Prefer `Pixel_10`. Otherwise, use the first AVD from `emulator -list-avds`. |
| Android package | `com.seyfsasy.spendeazymobile` |
| Node | `24.11.1`. Check with `node -v`. If another version takes precedence, prepend the `24.11.1` installation to `PATH`. |

If you change a port, update every setting that uses it. See [Alternative ports](#alternative-ports).

## Stop conditions

Stop and ask the user when any of these conditions applies:

- Clerk or Google values are missing from both the configuration files and the environment. Never invent these values.
- The device shows a credential, consent, or multifactor authentication (MFA) prompt but there is no supplied credentials to be used for testing. Report the prompt. Do not report a successful Dashboard check.
- A port serves an instance you do not recognize. Do not stop unrelated processes that use ports.

## Daily startup

1. Complete [first-time setup](#first-time-setup).
2. Stop old API, PostgreSQL, Metro, and emulator sessions.
3. For Android, run the preflight script below in Git Bash on Windows or Bash on Linux.

The preflight script checks Docker, Android Debug Bridge (ADB), local settings, and the API port before startup.

```bash
# cwd: .
bash scripts/android-preflight.sh
```

### 1. PostgreSQL

```bash
# cwd: .
docker compose up -d --wait
```

Check that `docker compose ps` shows `healthy`.

### 2. API

Run these commands in a separate terminal. Continue to `npm run start:dev` only if the migrations succeed. Keep the API running.

```bash
# cwd: api
npm run migration:run
npm run start:dev
```

Check that `curl -fsS http://127.0.0.1:3000/health` succeeds. Use your configured port if it differs.

### 3. Android emulator

```bash
# cwd: .
adb devices -l
emulator -avd Pixel_10   # Pixel_10 default only; leave running
adb -s <serial> shell getprop sys.boot_completed
```

Check that the serial has status `device`. Check that `boot_completed` prints `1`.

### 4. Metro and app

Run these commands in a separate terminal. Keep Metro running.

```bash
# cwd: mobile-app
npm run statement-import:prepare
npx expo start --dev-client --localhost
```

Check that `curl http://127.0.0.1:8081/status` prints `packager-status:running`.
If this check fails on Windows, Metro uses IPv6 only. Restart Metro with this command:

```bash
# cwd: mobile-app
NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost
```

Press `a` in the Expo terminal.

If the app cannot reach Metro, run:

```bash
# cwd: .
adb -s <serial> reverse tcp:8081 tcp:8081   # use Expo's port on both sides if not 8081
```

This `adb reverse` command routes Metro traffic only. The API URL remains `http://10.0.2.2:<API PORT>`. Keep one Metro server per checkout.

If no development build exists, stop Metro. Also stop Metro if native dependencies or configuration changed. Then run:

```bash
# cwd: mobile-app
npx expo run:android --device
```

This command builds and installs the app. It also starts Metro. Expo Go cannot run this app's native Google sign-in.

`expo run:android` may rewrite the `android` and `ios` scripts in `package.json`. Restore these scripts unless you intend the change.
`npm run android` and `npm run ios` only open an installed build.

Startup is complete when you can use the sign-in screen or Dashboard.
A slow emulator can show a blank development client with a visible gear or a system "not responding" dialog.
These states are normal. If the dialog appears, choose **Wait**.

Dashboard requires the Google test account to be signed in on the device.

## After a change

| Change | Action | Check |
| --- | --- | --- |
| Mobile JS/TS | Use Fast Refresh. For a full reload, press `r` in Expo. | The screen updates. |
| `mobile-app/.env.local` | Press `r` for a full reload. No rebuild is necessary. | The new value takes effect. |
| API source | Nest restarts the API in watch mode. | `/health` returns 200. |
| `api/.env.local` | Stop the API. Run `npm run start:dev` in `api/`. | `/health` returns 200. |
| Migrations | Stop the API. Run `npm run migration:run` in `api/`. Restart the API. | The migration succeeds. |
| Dependencies | Run `npm ci` in the affected project. Rebuild the mobile app if native dependencies changed. | Installation succeeds. |
| Native dependencies, plugins, app configuration | Stop Metro. In `mobile-app/`, run `npx expo prebuild --clean`. Then run `npx expo run:android --device`. | The app opens. |
| Parser implementation or assets | Run `npm run statement-import:prepare` in `mobile-app/`. Reload the app. | The reload succeeds. |

`prebuild --clean` replaces the generated native projects that Git ignores. Keep native changes in the app configuration or plugins.
See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [native generation](https://docs.expo.dev/workflow/continuous-native-generation/).

## Shutdown and reset

1. Stop Expo with Ctrl+C.
2. Stop Nest with Ctrl+C.
3. Run this command:

```bash
# cwd: .
docker compose stop
```

Data and keys remain. `docker compose down` also deletes containers and the network. It retains the named volume.

**Reset the manual database only when you intend to delete all its data.**

Stop the API. Then run:

```bash
# cwd: .
docker compose down --volumes
docker compose up -d --wait
```

1. Run migrations as described in [Daily startup](#daily-startup).
2. Restart the API.
3. Keep your API keys.
4. Sign out of Clerk on the device.
5. Sign in again to provision a new User.

A PostgreSQL reset does not end the Clerk session on the device.
For optional synthetic fixtures, see [API seed/reset](../../api/README.md#development-seedreset).
These fixtures do not populate the Personal Space for the real Google identity.

## First-time setup

### 1. Tools

- Git, Node.js `24.11.1`, npm.
- Docker with Linux containers and `docker compose`. Start Docker before you run database commands.
- Android: follow [Expo environment setup](https://docs.expo.dev/get-started/set-up-your-environment/).
  - Set `ANDROID_HOME`.
  - Add `platform-tools` to `PATH`.
  - Use an emulator with a **Google Play** image. Native Google sign-in requires Play services.
- Physical iPhone: see [iPhone testing](LOCAL_TESTING_IPHONE.md).

### 2. Install

```bash
# cwd: .
npm ci --prefix api
npm ci --prefix mobile-app
cp api/.env.example api/.env.local
cp mobile-app/.env.example mobile-app/.env.local
```

Keep existing `.env.local` files when you return to the project. Do not replace them with the example files.

Move an existing `api/.env` to `api/.env.local`. The API no longer reads `.env` automatically.
If a startup script already created `api/.env.local`, check its `DATABASE_URL`.
Keep that file only if `DATABASE_URL` points to the Compose database in [Defaults](#defaults).

### 3. Configure values

| File | Variable | Value / source |
| --- | --- | --- |
| `api/.env.local` | `INVITATION_CODE_ENCRYPTION_KEY` | Generate the key as described below. Retain it with the database. |
| `api/.env.local` | `GCASH_REFERENCE_HASH_KEY` | Generate a second, independent key. Retain it with the database. |
| `api/.env.local` | `CLERK_SECRET_KEY` | `sk_test_…` from the dedicated Clerk development instance |
| `api/.env.local` | `CLERK_JWT_KEY` | The RSA PEM public key from that instance. The single-line form uses literal `\n`. |
| `mobile-app/.env.local` | `EXPO_PUBLIC_API_BASE_URL` | `http://10.0.2.2:3000` |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` from the **same** Clerk instance |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` | The Web-type Google OAuth client ID for that Clerk instance. Clerk's native Google sign-in requires this ID as the server/token audience. The client type is Web, even for this native app. |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` | Android client ID for the package above and the build's signing SHA-1 |

Generate each key separately:

```bash
# cwd: .
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy existing values from the environment. Otherwise, leave the values empty. Follow the [stop conditions](#stop-conditions).

Use only public identifiers in `EXPO_PUBLIC_*`. Keep secrets in `api/.env.local`.
Without Clerk values, `/health` works but authenticated requests fail.
For the Web-type client ID and Android SHA-1, see [Google/Clerk setup](LOCAL_TESTING_AUTH.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Docker unavailable or database unhealthy | Start Docker with Linux containers. Run `docker compose ps`. Read the logs with `docker compose logs postgres`. |
| Database connection refused | Check that Compose reports a healthy database. Check that `DATABASE_URL` uses port `55433`. Run API commands from `api/`. |
| Missing encryption/hash key | Set both independent 64-hex values in `api/.env.local`. |
| `/health` works, private requests fail | Check that all Clerk keys come from the same instance. Complete sign-in. See [API auth](../../api/docs/LOCAL_TESTING.md). |
| Google configuration/developer error | See [Google/Clerk setup](LOCAL_TESTING_AUTH.md). |
| Sign-in stuck on "Signing in", no Google UI | Add the Google test account on the device. Alternatively, register the build's debug SHA-1 on the Android OAuth client. |
| Device cannot reach API | Check the `EXPO_PUBLIC_API_BASE_URL` port, API terminal, and firewall. Try `adb reverse tcp:3000 tcp:3000` with URL `http://localhost:3000`. Use your configured port in both. |
| App cannot reach Metro | Check with `curl http://127.0.0.1:8081/status`. Restart Metro with `--localhost`. Run `adb reverse` again with Expo's port. |
| `unexpected end of stream on http://127.0.0.1:8081` | Metro uses IPv6 only. Restart Metro with `NODE_OPTIONS=--dns-result-order=ipv4first`. Run `adb reverse` again. |
| Expo times out querying packages | Wait until `boot_completed` returns `1`. Retry. If no development build exists, run `npx expo run:android --device`. |
| `Cannot find native module 'ExponentImagePicker'` | The development build predates the module. Stop Metro. In `mobile-app/`, run `npx expo prebuild --platform android --no-install`. Then run `npx expo run:android --device`. Restore the `package.json` scripts. |
| `npm run android` starts a native compile | `expo run:android` rewrote the scripts. Restore the scripts. |
| Not responding on first open | Choose **Wait**. |
| Missing generated parser module | Run `npm run statement-import:prepare` in `mobile-app/`. Reload the app. |
| Old configuration | Unset stale environment overrides in the shell. Reload the mobile app. Restart the API. |
| Old stack still running | Stop the stack from its original checkout. The Compose project does not adopt or delete old runs. |
| `EACCES` binding API port (Windows) | Run the Android preflight to check the port and find an available fallback. |
| Busy port | Stop only the instance you recognize, or use another port. |

### Alternative ports

- API: set `PORT` in `api/.env.local`. Update `EXPO_PUBLIC_API_BASE_URL`.
- Metro: run `npx expo start --dev-client --localhost --port 8082`. Use `8082` on both sides of `adb reverse`.
- PostgreSQL: run `export SPENDEAZY_MANUAL_DB_PORT=55434`. Run Compose again. Update `DATABASE_URL` to use the same port.
- Concurrent checkouts: assign a distinct `docker compose -p <name>` project and distinct ports to each checkout.
  Use those project names and ports consistently for startup, shutdown, and reset.
  One emulator can run only one checkout's app at a time.
