# Spendeazy

Spendeazy is a personal-finance app for Android and iPhone. The browser client and its hosting have been retired. The API now stores saved spending as Expenses under explicit authorized Space routes. The native app signs in with Google and connects to the API for Spaces and manual Expense creation, browsing and detail. The broader [Expense domain and mobile API contract](docs/specifications/mobile-expense-domain-api.md) is only partly implemented.

The mobile replacement and API share the [root domain glossary](GLOSSARY.md). The [replacement ADR](docs/adr/0004-mobile-expense-domain-and-contract.md) records the target decision and its implemented Expense foundation; it also tracks remaining mobile and contract work.

## Projects

| Project | Purpose | Guidance |
| --- | --- | --- |
| `mobile-app/` | Expo and React Native native client | [Mobile setup](mobile-app/README.md), [agent guidance](mobile-app/AGENTS.md) |
| `api/` | NestJS REST API and PostgreSQL persistence | [API setup](api/README.md), [architecture](api/ARCHITECTURE.md) |

The former browser client and hosting have been retired. `web/design/` remains as a legacy visual reference; it is not an application or a build target. Statement Import remains an on-device parser prototype; the full replacement is not implemented yet.

## Responsibilities

The mobile app handles PDF selection, password entry, extraction in a restricted local WebView, provider interpretation, reconciliation, local Category Rule matching and the review experience. Statement files and passwords stay on the device; the API does not parse PDFs or categorize statement rows.

The API resolves the authenticated User, authorizes the requested Space, validates and stores Expenses and Statement Import provenance in PostgreSQL, and serves reports. The saved-resource API uses Expense terminology; parsed statement Transactions remain on-device evidence. The implementation status and remaining target behavior are documented in [the mobile Expense/API specification](docs/specifications/mobile-expense-domain-api.md).

## Local development and testing

Start with [the local runbook](docs/local-testing.md): first-time setup, daily startup, manual checks, troubleshooting and reset. It uses PostgreSQL in Docker, the API in Nest watch mode and Expo development builds. The same instructions apply to humans and AI agents.

Install dependencies in the owning project. API unit/HTTP/PostgreSQL checks and mobile application, lint, type, and parser checks run independently. The separate [automated checks guide](docs/local-checks.md) documents existing software checks and isolated integration databases. Application tests, lint, type checks, and parser fixtures are software checks; native build/device review and the parser launch gate in issue [#138](https://github.com/yororo/spendeazy/issues/138) remain separate release evidence.
