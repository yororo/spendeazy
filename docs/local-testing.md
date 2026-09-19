# Local synthetic testing

The local test launcher starts the real Spendeazy web app and API against a dedicated PostgreSQL container. It uses a fixed fictional identity and temporary session credentials; it does not use Clerk or ordinary development database settings.

## Prerequisites

- Node.js 24 and npm
- Docker Desktop with Docker Compose available as `docker compose`
- Dependencies installed in both projects (`npm install` from `api/` and `web/`)

## Start the manual environment

From the repository root:

```powershell
node .\scripts\local-test-launcher.mjs
```

The same command works from a Windows PowerShell terminal. The launcher checks the three loopback ports before starting, starts PostgreSQL, validates and migrates the dedicated database, starts the API and web server on loopback, and opens the browser at `http://127.0.0.1:5174/`.

The synthetic session uses the normal authentication guard, User provisioning service, self-scoped HTTP client, and PostgreSQL stores. The browser shows a `LOCAL TEST` panel so this mode is unmistakable.

On the first startup, the launcher migrates the empty dedicated database and creates a small fictional current-month scenario: Categories, monthly Budgets, Category Rules, and manual Transactions whose descriptions are marked as demo or fixture data. Subsequent ordinary startups detect the fixed local-test User and only run migrations; they preserve manual edits and newly created data.

Press `Ctrl+C` to stop the API and web processes and remove the PostgreSQL container. The named database volume is retained for ordinary manual restarts. If a port is already occupied, the launcher reports the exact loopback port and exits without attaching to or stopping the unrelated process.

## Reset the manual fixtures

Stop the running manual environment first, then run this explicit reset command from the repository root:

```powershell
node .\scripts\local-test-launcher.mjs --reset
```

The launcher-owned database is validated before the reset begins. The reset drops only that exact loopback PostgreSQL database, reruns migrations, restores the fictional fixture scenario, and starts the manual environment again. It rejects missing launcher markers, non-loopback hosts, ordinary development credentials, and other database names before any destructive operation. A normal startup never performs this reset.

If a retained database was created by an earlier local-test version and contains the fixed User without this fixture scenario, use this explicit reset once; ordinary startup leaves existing data untouched rather than guessing whether it is safe to merge fixtures.

## Run the browser smoke test

The automated mode uses separate loopback ports and a fresh Compose project/volume:

```powershell
node .\scripts\local-test-launcher.mjs --e2e
```

It starts the same real browser/API/database path, runs the Playwright smoke test, and removes only that isolated automated database volume when finished. Playwright can also be run against an already-running environment with `npm run test:e2e` from `web/` when `SPENDEAZY_E2E_BASE_URL`, `SPENDEAZY_E2E_API_BASE_URL`, `SPENDEAZY_E2E_TEST_DATE`, and `VITE_LOCAL_TEST_SESSION_TOKEN` are set to that environment's loopback URL, controlled current-month date, and temporary token.

The automated run intentionally starts with an empty database so the provisioning smoke test remains a real first-time provisioning check. The persistent fictional scenario is the ordinary manual-startup and explicit-reset fixture.

## Security boundary

The dedicated API entrypoint requires `NODE_ENV=test`, a launcher marker, the exact loopback database credentials/name, and a short-lived signed synthetic session token. It accepts only the fixed fictional identity; missing, malformed, expired, or caller-invented identity values are rejected. The normal API entrypoint never registers the synthetic providers, and production module composition rejects an attempt to inject them.

The production API build copies only `api/src` into its artifact. The local API entrypoint and providers live under `api/local-test`; the local web entrypoint and panel live under `web/local-test`, outside the normal Vite/TypeScript build entrypoints.
