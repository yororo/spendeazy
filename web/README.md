# Spendeazy Web

React/TypeScript browser application using Vite and Tailwind, backed by the sibling API. Commands and paths below are relative to `web/`; [architecture](docs/ARCHITECTURE.md#task-entry-points) locates feature owners.

## Setup and run

Requires Node.js and npm.

```bash
npm install
cp .env.example .env.local
```

Configure your Clerk instance and API origin:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:3000
```

Enable Google as a social connection in Clerk. Add the deployed `/sso-callback` URL to Google's allowed OAuth redirect URLs; use the equivalent Vite-origin URL locally. The client uses only the publishable key; keep the Clerk backend secret in the API.

Start the API using [its setup guide](../api/README.md#setup-and-run), then run `npm run dev` here. Use the same Clerk instance in both projects. `VITE_API_BASE_URL` must be the API's HTTP(S) origin; its CORS and Clerk authorized-party settings must allow the exact frontend origin (normally `http://localhost:5173`). `../api/src/config/app-config.ts` owns allowed methods/headers; `../api/src/bootstrap.ts` applies preflight, response, and CORS behavior.

See [browser/API integration](../README.md#integration-boundary) and [Personal route compatibility](../api/docs/route-compatibility.md).

## Validation

See [required checks and focused unit tests](AGENTS.md#validation). `npm run typecheck:e2e` checks browser tests/Playwright configuration without services. [Synthetic testing](../docs/local-testing.md#focused-browser-diagnostics) owns browser setup, diagnostic selectors, and the unfiltered completion run.
