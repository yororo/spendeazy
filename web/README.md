# Spendeazy Web

The browser application for Spendeazy, backed by the sibling [API project](../api/README.md). Read the [shared glossary](../GLOSSARY.md) for domain terms and [architecture](docs/ARCHITECTURE.md) for code placement. All commands and paths below are relative to `web/`.

## Main Features

- Dashboard for quick overview of expenses and budgets
- Importing supported account statements in PDF format, including BDO AMEX, EastWest Visa, and GCash E-Wallet
- Automatic parsing and categorization of imported statements to extract transactions and categorize them
- Budget management with the ability to set budgets for different categories and track spending against them
- SSO integration for secure and convenient user authentication

## Tech stack

React, TypeScript, Tailwind CSS, Vite, and Node.js.

## Setup and run

From `web/`, run `npm install`, configure the environment below, then run `npm run dev`. Start the API separately using its README. Use `npm run lint`, `npm run build`, and `npm test` to validate web code changes.

Run `npm run typecheck:e2e` for strict browser-test and Playwright configuration
checking without services. See [focused browser diagnostics](../docs/local-testing.md#focused-browser-diagnostics)
for supported spec/title selection and the required unfiltered completion run.

## Authentication and API setup

Spendeazy uses Clerk SSO. Copy `.env.example` to `.env.local`, then replace the placeholder with the publishable key from your Clerk instance:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:3000
```

Enable Google as a social connection in that Clerk instance. Add the deployed `/sso-callback` URL to Google's allowed OAuth redirect URLs;
for local development, use the equivalent URL on the Vite development origin.
No Clerk secret key is used by this client-only application.

`VITE_API_BASE_URL` is the HTTP(S) origin of the Spendeazy API. The current Clerk session authenticates every private API request. User provisioning and identity use `/api/v1/users/me`; financial adapters use `/api/v1/users/me/spaces/:spaceId/...` for the selected Space, with legacy Personal Space routes as compatibility fallbacks. The API enforces membership and write access from the authenticated User.

Authenticated Dashboard, Transactions, Categories, and Statement Import data all come from the persisted API—there is no bundled financial-data fallback.

The browser calls this API origin directly. Configure the API's CORS policy to allow each exact frontend origin (including the local Vite origin, normally `http://localhost:5173`), the `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` methods, and the `Accept`, `Authorization`, and `Content-Type` request headers. The API must answer the corresponding `OPTIONS` preflight and return JSON responses with an appropriate `Content-Type`.
