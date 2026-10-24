# Spendeazy

Spendeazy is a personal-finance app for Android and iPhone. The browser client and its hosting have been retired. The native app is still a starter plus a parser prototype; its full financial journeys and the accepted [Expense domain and mobile API contract](docs/specifications/mobile-expense-domain-api.md) are not implemented yet.

The mobile replacement and API share the [root domain glossary](GLOSSARY.md). The [replacement ADR](docs/adr/0004-mobile-expense-domain-and-contract.md) records the target decision; current API runtime routes and schemas remain Transaction-oriented until the API replacement is implemented.

## Projects

| Project | Purpose | Guidance |
| --- | --- | --- |
| `mobile-app/` | Expo and React Native native client | [Mobile setup](mobile-app/README.md), [agent guidance](mobile-app/AGENTS.md) |
| `api/` | NestJS REST API and PostgreSQL persistence | [API setup](api/README.md), [architecture](api/ARCHITECTURE.md) |

The former browser client and hosting have been retired. `web/design/` remains as a legacy visual reference; it is not an application or a build target. The current mobile source is still a starter plus parser prototype, and the replacement's full user journeys are not implemented yet.

## Responsibilities

The mobile app handles PDF selection, password entry, extraction in a restricted local WebView, provider interpretation, reconciliation, local Category Rule matching and the review experience. Statement files and passwords stay on the device; the API does not parse PDFs or categorize statement rows.

The API resolves the authenticated User, authorizes the requested Space, validates and stores financial resources in PostgreSQL, and serves reports. The approved target contract is documented in [the mobile Expense/API specification](docs/specifications/mobile-expense-domain-api.md); current runtime routes and schema still reflect the legacy Transaction model until the API replacement is implemented.

## Local validation

Install dependencies in the owning project. API unit/HTTP/PostgreSQL checks and mobile lint/type/parser checks run independently. The root [local testing guide](docs/local-testing.md) documents commands, disposable databases and device setup. Lint, type checks and parser fixtures are software checks; native build/device review and the parser launch gate in issue [#138](https://github.com/yororo/spendeazy/issues/138) remain separate release evidence.
