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

The fictional User is provisioned through the normal authentication guard, User provisioning service, Default Category creation, HTTP client, and PostgreSQL stores. The browser shows a `LOCAL TEST` panel so this mode is unmistakable.

Press `Ctrl+C` to stop the API and web processes and remove the PostgreSQL container. The named database volume is retained for ordinary manual restarts. If a port is already occupied, the launcher reports the exact loopback port and exits without attaching to or stopping the unrelated process.

## Run the browser smoke test

The automated mode uses separate loopback ports and a fresh Compose project/volume:

```powershell
node .\scripts\local-test-launcher.mjs --e2e
```

It starts the same real browser/API/database path, runs the Playwright smoke test, and removes only that isolated automated database volume when finished. Playwright can also be run against an already-running environment with `npm run test:e2e` from `web/` and `SPENDEAZY_E2E_BASE_URL` set to its loopback URL.

## Security boundary

The dedicated API entrypoint requires `NODE_ENV=test`, a launcher marker, the exact loopback database credentials/name, and a short-lived signed synthetic session token. It accepts only the fixed fictional identity; missing, malformed, expired, or caller-invented identity values are rejected. The normal API entrypoint never registers the synthetic providers, and production module composition rejects an attempt to inject them.

The production API build copies only `api/src` into its artifact. The local API entrypoint and providers live under `api/local-test`; the local web entrypoint and panel live under `web/local-test`, outside the normal Vite/TypeScript build entrypoints.
