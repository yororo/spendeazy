# Pixel_10 Android smoke test, November 10, 2026

Ran on user's Windows machine.

Spendeazy app sign-in, manual expense creation, and viewing the saved expense all passed on `Pixel_10` against the local API at commit `13a7603`. Google accepted the test account already registered on the emulator, so the app sign-in passed without a password prompt. This run did not exercise adding the Google account to a clean device or using `SPENDEAZY_TEST_EMAIL_PASSWORD`.

## What I ran

1. Followed the [local testing runbook](LOCAL_TESTING.md) on Windows with Node `24.11.1`. Reused the installed npm dependencies, development APK, existing `.env.local` credentials, and the Compose data volume. The database container was stopped at the start of the run.
2. Ran `docker compose up -d --wait`. PostgreSQL became healthy at `127.0.0.1:55433`. From `api/`, ran `npm run migration:run`, which reported no pending migrations, then `npm run start:dev`. After resolving a Windows port reservation, `http://127.0.0.1:4101/health` returned HTTP 200 with the database ready.
3. Started `emulator -avd Pixel_10`. ADB identified `emulator-5554` as `Pixel_10`, `sys.boot_completed` returned `1`, and the device had Google Play services and the Spendeazy development build.
4. Ran `npm run statement-import:prepare` in `mobile-app/`, started Expo with IPv4 preferred, and verified `packager-status:running` at `http://127.0.0.1:8081/status`. Restored the Metro reverse mapping, stopped the app process that Quick Boot restored, and pressed `a` in Expo to open the current bundle.
5. Scrolled Profile until **Sign out** was above the floating navigation bar, signed out of Spendeazy, and tapped **Tap to sign-in**. Selected `spendeazytestuser@gmail.com` from Google's existing device accounts. Dashboard loaded in the Personal Space after the account selection.
6. Used **+ → Add expense** to save `Pixel 10 smoke 20261110` for **₱12.34**, dated **November 10, 2026**, in **Food & Drink**. Closed the Add menu and opened the **Expenses** tab. Its date range was still October, so I extended the end date to November 10 and applied it. The list displayed the exact description, amount, category, and date. Opening the row showed the same values in **Edit expense**.

The synthetic expense was left in the local database for inspection.

## Challenges and proposed runbook changes

| What happened | Proposed change |
| --- | --- |
| Docker Desktop was running, but the managed shell could not access its named pipe or start ADB in the default sandbox. Running the authorized host commands outside the sandbox resolved both failures. | Add a Windows preflight with `docker compose ps` and `adb devices -l`. Distinguish an unavailable Docker daemon from named-pipe access denied, and flag sandbox permissions before troubleshooting Docker or the emulator itself. |
| Windows reserved both API port `4000` and the runbook's fallback `3307`. Nest's safe log showed the startup failure at `app.listen` without the underlying error code. A direct Node bind reported `EACCES` on both ports. | Check the listener and excluded TCP ranges before picking a fallback. Verify the new port can bind before updating `PORT` and `EXPO_PUBLIC_API_BASE_URL`. Avoid suggesting a fixed fallback as universally available. |
| `mobile-app/.env.local` pointed at a LAN IP from an earlier session. After changing the port, a full app reload alone still showed connection errors. Restarting Metro and reopening the Android bundle loaded the new URL. | Verify the emulator URL before starting Metro. When an environment change still leaves a connection error after reload, restart Metro, check its IPv4 status endpoint, and open the app again. |
| Quick Boot resumed the last app screen even though no Metro reverse mapping was present. The first Android bundle took about 19 seconds once bundling started. | Distinguish device boot, Metro readiness, and app readiness. If an old app screen is already visible, restore the reverse mapping, force-stop just the app, and reopen it from the current Metro session. Treat an IPv4 status failure as a reason to check both listener addresses and server readiness. |
| The Google picker contained multiple device accounts, including the requested test account. No password prompt appeared. | Separate app sign-in on a provisioned emulator from first-time Google device setup. Verify the exact test email in the picker. For first-time setup, document the approved vault provider and lookup procedure for `SPENDEAZY_TEST_EMAIL_PASSWORD`, plus the handoff for a password, consent, or MFA prompt. Keep the credential value out of the runbook. |
| Expenses retained an October date filter, hiding the November entry immediately after save. | Add a manual smoke checklist with a unique synthetic description, Personal Space, and a date range that includes the expense. Require the row and its saved values to be visible in Expenses. |

### Windows commands to add to the runbook

From the repository root, inspect reserved ranges and probe a candidate API port. `4101` was available for this run.

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
netsh interface ipv6 show excludedportrange protocol=tcp
node -e "const s=require('node:net').createServer(); s.on('error', e => { console.error(e.code); process.exitCode=1 }); s.listen(4101, () => { console.log('Bind OK'); s.close() })"
```

For this run, `api/.env.local` used `PORT=4101` and `mobile-app/.env.local` used `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4101`. Check the host API with `curl.exe -fsS http://127.0.0.1:4101/health`.

From `mobile-app/`, use PowerShell syntax for the Metro environment setting. The IPv4 health probe passed with this configuration. An IPv6-only failure was not reproduced during this run.

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
npx expo start --dev-client --localhost
```

From another terminal, use the serial reported by `adb devices -l`. After these checks, press `a` in the Expo terminal.

```powershell
curl.exe -fsS http://127.0.0.1:8081/status
adb -s emulator-5554 shell getprop sys.boot_completed
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 reverse --list
# Run only if Quick Boot restored an old Spendeazy screen.
adb -s emulator-5554 shell am force-stop com.seyfsasy.spendeazymobile
```
