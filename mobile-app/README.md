# Spendeazy mobile

## Replacement specification

Use the shared [root glossary](../GLOSSARY.md), [Expense domain and mobile API contract](../docs/specifications/mobile-expense-domain-api.md), and [replacement ADR](../docs/adr/0004-mobile-expense-domain-and-contract.md) for the accepted target. These plan the replacement; the starter instructions below are not evidence that its financial workflows or API already exist.

The native client uses Expo Router and React Native. Current screens are still the Expo starter plus a local PDF.js parser prototype; the approved Expense, Budget, reporting and sharing journeys are not implemented yet.

## Setup and checks

Use Node.js 24.11.1 to match CI. From the repository root:

```bash
npm ci --prefix mobile-app
npm --prefix mobile-app run lint
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run parser:test
```

`parser:test` prepares the bundled parser prototype and runs fictional provider/Category Rule regressions. It does not establish native build or device acceptance. The internal PDF.js parser runs inside a native WebView; this is not a browser app.

## Native development

Install Android Studio and create an Android emulator, then generate and run a native development build from `mobile-app/`:

```bash
npx expo run:android
```

For a physical iPhone, build an internal native binary with EAS from `mobile-app/`:

```bash
npx eas-cli@latest build --profile development --platform ios
```

Use `npx expo start --dev-client` to run JavaScript in an installed development build. Expo Go is not a substitute for the native modules used by this app. iOS simulator and local Xcode builds require macOS.

The parser prototype route can be run with `npm run parser:proof` after a development build is installed. `npm run parser:prepare` bundles PDF.js, its worker and resources for the local WebView; EAS runs it through `eas-build-post-install`.

## API and device testing

The current mobile starter has no API adapter or API base-URL setting yet. Do not treat a successful parser or app build as proof that authenticated API journeys work.

When testing a device against a development backend, use a dedicated development API and PostgreSQL database with a real Google/Clerk test identity. Android emulator `localhost` is the emulator itself; use the emulator host mapping (`10.0.2.2`) for a service running on the development computer, or a device-reachable LAN/HTTPS endpoint for physical devices. Do not expose a production API or use an ordinary financial database. Synthetic API test identities are limited to isolated automated tests and cannot provide physical-device sign-in evidence.

The API's deterministic fictional seed is for a specifically selected local development database. `db:reset-seed` drops the configured database, so use it only after verifying `DATABASE_URL` names the disposable database you intend to recreate. API PostgreSQL automation uses fresh isolated databases; see [local testing](../docs/local-testing.md).

## Release evidence

Record the app/API revisions, native build profile, device model and OS, relevant configuration and observed result. Keep evidence sanitized: do not commit PDF statements, passwords, extracted text, financial screenshots or credentials.

Mobile lint, TypeScript and parser fixture checks are automated software checks only. Personal-use readiness also requires installable native builds, Android emulator and physical-iPhone journey evidence, and the remaining parser limits/device/cleanup checks in [issue #138](https://github.com/yororo/spendeazy/issues/138). No device certification is claimed by CI.

## Design

The current visual source is [mobile-design.pen](mobile-design.pen). Read [design-token.md](design-token.md) before changing colors, typography, spacing or component surfaces.
