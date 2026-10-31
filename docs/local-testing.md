# Test the app locally

Humans and AI agents use the same workflow: PostgreSQL in Docker, the API in one terminal, Expo in another. Data survives shutdown.

All commands are Bash. Every block starts with `# cwd:` (relative to the repository root).

## Defaults

| Item | Value |
| --- | --- |
| API port | `4000` (`PORT` in `api/.env`) |
| API URL from Android emulator | `http://10.0.2.2:4000` |
| Metro port | `8081` |
| PostgreSQL | `127.0.0.1:55433`, database `spendeazy_disposable_manual` (root `compose.yaml`) |
| Android emulator AVD | `Pixel_10` (prefer it; otherwise the first of `emulator -list-avds`) |
| Android package | `com.seyfsasy.spendeazymobile` |
| Node | `24.11.1` (check `node -v`; prepend the 24.11.1 install to `PATH` if another is first) |

If you change a port, change every place that uses it (see [Alternative ports](#alternative-ports)).

## Stop conditions (ask the user)

- Clerk or Google values are missing and not in the environment. Never invent them.
- A credential, consent or MFA prompt appears on the device. Report it; do not claim Dashboard passed.
- A port is busy with an instance you do not recognize. Do not kill unrelated listeners.

## Daily startup

Prerequisites: [first-time setup](#first-time-setup) done. Start from a clean session: stop old API, PostgreSQL, Metro and emulators first. Check that `api/.env` `DATABASE_URL` uses port `55433` and `mobile-app/.env.local` `EXPO_PUBLIC_API_BASE_URL` is `http://10.0.2.2:<API PORT>`.

### 1. PostgreSQL

```bash
# cwd: .
docker compose up -d --wait
```

Verify: `docker compose ps` shows `healthy`.

### 2. API (own terminal, leave running)

```bash
# cwd: api
npm run migration:run
npm run start:dev
```

Continue only if migrations succeed. Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health` prints `200`.

### 3. Android emulator

```bash
# cwd: .
adb devices -l
emulator -avd Pixel_10   # Pixel_10 default only; leave running
adb -s <serial> shell getprop sys.boot_completed
```

Verify: the serial is `device` and `boot_completed` prints `1`.

### 4. Metro and app (own terminal, leave running)

```bash
# cwd: mobile-app
npm run statement-import:prepare
npx expo start --dev-client --localhost
```

Verify: `curl http://127.0.0.1:8081/status` prints `packager-status:running`. If it fails on Windows, Metro is on IPv6 only; restart it with:

```bash
# cwd: mobile-app
NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost
```

Then press `a` in the Expo terminal. 

If the app cannot reach Metro:

```bash
# cwd: .
adb -s <serial> reverse tcp:8081 tcp:8081   # use Expo's port on both sides if not 8081
```

The reverse is for Metro only; the API stays on `10.0.2.2:<API PORT>`. Keep one Metro server per checkout.

If there is no development build, or native dependencies/config changed, stop Metro and run:

```bash
# cwd: mobile-app
npx expo run:android --device
```

This builds, installs and starts Metro. Expo Go cannot run this app's native Google sign-in. `expo run:android` may rewrite the `android`/`ios` scripts in `package.json`; restore them unless the change is intended. `npm run android`/`npm run ios` only open an installed build.

Startup is complete when the sign-in screen or Dashboard is usable. A blank dev client (gear visible) or a system "not responding" dialog on a slow emulator is normal: choose **Wait**. Dashboard needs the Google test account signed in on the device.

## After a change

| Change | Action | Verify |
| --- | --- | --- |
| Mobile JS/TS | Fast Refresh; `r` in Expo for full reload | Screen updates |
| `mobile-app/.env.local` | Full reload (`r`); no rebuild | New value takes effect |
| API source | Nest watch restarts | `/health` returns 200 |
| `api/.env` | Stop and rerun `npm run start:dev` in `api/` | `/health` returns 200 |
| Migrations | Stop API; `npm run migration:run` in `api/`; restart | Migration succeeds |
| Dependencies | `npm ci` in that project; rebuild mobile if native | Install succeeds |
| Native deps, plugins, app config | Stop Metro; in `mobile-app/`: `npx expo prebuild --clean`, then `npx expo run:android --device` | App opens |
| Parser implementation/assets | `npm run statement-import:prepare` in `mobile-app/`, then reload | Reload succeeds |

`prebuild --clean` replaces ignored generated native projects; keep native changes in app config/plugins. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [native generation](https://docs.expo.dev/workflow/continuous-native-generation/).

## Shutdown and reset

Stop Expo and Nest with Ctrl+C, then:

```bash
# cwd: .
docker compose stop
```

Data and keys remain. `docker compose down` also removes containers/network but keeps the named volume.

**Reset only to delete all data in the manual database.** Stop the API, then:

```bash
# cwd: .
docker compose down --volumes
docker compose up -d --wait
```

Run migrations and restart the API per Daily startup. Keep your API keys. Resetting PostgreSQL does not sign the device out of Clerk; sign out and in to provision a fresh User. Optional synthetic fixtures: [API seed/reset](../api/README.md#development-seedreset) (they do not populate the real Google identity's Personal Space).

## First-time setup

### 1. Tools

- Git, Node.js `24.11.1`, npm.
- Docker with Linux containers and `docker compose`, running before database commands.
- Android: [Expo environment setup](https://docs.expo.dev/get-started/set-up-your-environment/). Set `ANDROID_HOME`, put `platform-tools` on `PATH`, and use an emulator with a **Google Play** image (native Google sign-in needs Play services).
- Physical iPhone: see [iPhone testing](local-testing-iphone.md).

### 2. Install

```bash
# cwd: .
npm ci --prefix api
npm ci --prefix mobile-app
cp api/.env.example api/.env
cp mobile-app/.env.example mobile-app/.env.local
```

Keep existing `.env` files when returning. If a startup script already wrote `api/.env`, keep it only if its `DATABASE_URL` is the Compose database from [Defaults](#defaults).

### 3. Configure values

| File | Variable | Value / source |
| --- | --- | --- |
| `api/.env` | `INVITATION_CODE_ENCRYPTION_KEY` | Generated key (below). Keep with the database |
| `api/.env` | `GCASH_REFERENCE_HASH_KEY` | A second, independently generated key. Keep with the database |
| `api/.env` | `CLERK_SECRET_KEY` | `sk_test_…` from the dedicated Clerk development instance |
| `api/.env` | `CLERK_JWT_KEY` | That instance's RSA PEM public key; single-line form uses literal `\n` |
| `mobile-app/.env.local` | `EXPO_PUBLIC_API_BASE_URL` | `http://10.0.2.2:4000` |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` from the **same** Clerk instance |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` | Web-type Google OAuth client ID used by that Clerk instance (required by Clerk's native Google sign-in as the server/token audience; not a web app) |
| `mobile-app/.env.local` | `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` | Android client ID for the package above and the build's signing SHA-1 |

Generate each key separately:

```bash
# cwd: .
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy values from the environment when already set; otherwise leave them empty and follow the stop conditions. Only public identifiers go in `EXPO_PUBLIC_*`; secrets stay in `api/.env`. Without Clerk values `/health` works but authenticated requests fail. Finding the web client ID and the Android SHA-1: [Google/Clerk setup](local-testing-auth.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Docker unavailable / database unhealthy | Start Docker (Linux containers); `docker compose ps`, `docker compose logs postgres` |
| Database connection refused | Confirm Compose healthy and `DATABASE_URL` port `55433`; run API commands from `api/` |
| Missing encryption/hash key | Set both independent 64-hex values in `api/.env` |
| `/health` works, private requests fail | Clerk keys must be from one instance; complete sign-in; see [API auth](../api/docs/LOCAL_TESTING.md) |
| Google configuration/developer error | See [Google/Clerk setup](local-testing-auth.md) |
| Sign-in stuck on "Signing in", no Google UI | Add the Google test account on the device, or register the build's debug SHA-1 on the Android OAuth client |
| Device cannot reach API | Check `EXPO_PUBLIC_API_BASE_URL` port, the API terminal and firewall; try `adb reverse tcp:4000 tcp:4000` with URL `http://localhost:4000` |
| App cannot reach Metro | `curl http://127.0.0.1:8081/status`; restart with `--localhost`, rerun `adb reverse` with Expo's port |
| `unexpected end of stream on http://127.0.0.1:8081` | Metro is IPv6-only; restart with `NODE_OPTIONS=--dns-result-order=ipv4first`, rerun `adb reverse` |
| Expo times out querying packages | Wait for `boot_completed` = `1`, retry. No dev build: `npx expo run:android --device` |
| `Cannot find native module 'ExponentImagePicker'` | Dev build predates the module. Stop Metro; in `mobile-app/`: `npx expo prebuild --platform android --no-install`, then `npx expo run:android --device`; restore `package.json` scripts |
| `npm run android` starts a native compile | `expo run:android` rewrote the scripts; restore them |
| Not responding on first open | Choose **Wait** |
| Missing generated parser module | `npm run statement-import:prepare` in `mobile-app/`, then reload |
| Old configuration | Unset stale exported env overrides; reload mobile, restart API |
| Old stack still running | Stop it from its original checkout; the Compose project does not adopt or remove old runs |
| `EACCES` binding API port (Windows) | Port is reserved; pick another `PORT` (e.g. `3307`) and update the mobile URL |
| Busy port | Stop only the instance you recognize, or use another port |

### Alternative ports

- API: set `PORT` in `api/.env`; update `EXPO_PUBLIC_API_BASE_URL`.
- Metro: `npx expo start --dev-client --localhost --port 8082`; use 8082 on both sides of `adb reverse`.
- PostgreSQL: `export SPENDEAZY_MANUAL_DB_PORT=55434`, rerun Compose, match `DATABASE_URL`.
- Concurrent checkouts: use distinct `docker compose -p <name>` projects and ports consistently for startup, shutdown and reset. One emulator can run only one checkout's app at a time.
