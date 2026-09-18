# Spendeazy Web

A web based application for tracking expenses and managing budgets.

## Main Features

- Dashboard for quick overview of expenses and budgets
- Importing supported account statements in PDF format, including BDO AMEX, EastWest Visa, and GCash E-Wallet
- Automatic parsing and categorization of imported statements to extract transactions and categorize them
- Budget management with the ability to set budgets for different categories and track spending against them
- SSO integration for secure and convenient user authentication

## Tech stack

React, TypeScript, Tailwind CSS, Vite, and Node.js.

## Authentication and API setup

Spendeazy uses Clerk SSO. Copy `.env.example` to `.env.local`, then replace the placeholder with the publishable key from your Clerk instance:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:3000
```

Enable Google as a social connection in that Clerk instance. Add the deployed `/sso-callback` URL to Google's allowed OAuth redirect URLs;
for local development, use the equivalent URL on the Vite development origin.
No Clerk secret key is used by this client-only application.

`VITE_API_BASE_URL` is the HTTP(S) origin of the Expense Tracker API. The current Clerk session authenticates every private API request, and the API resolves ownership from that session through self-scoped `/api/v1/users/me` routes.

Authenticated Dashboard, Transactions, Categories, and Statement Import data all come from the persisted API—there is no bundled financial-data fallback.

The browser calls this API origin directly. Configure the API's CORS policy to allow each exact frontend origin (including the local Vite origin, normally `http://localhost:5173`), the `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` methods, and the `Accept`, `Authorization`, and `Content-Type` request headers. The API must answer the corresponding `OPTIONS` preflight and return JSON responses with an appropriate `Content-Type`.
