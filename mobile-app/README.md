# Spendeazy mobile

## Expense API foundation

Use the shared [root glossary](../GLOSSARY.md), [Expense domain and mobile API contract](../docs/specifications/mobile-expense-domain-api.md), and [replacement ADR](../docs/adr/0004-mobile-expense-domain-and-contract.md) for the accepted target. The API has implemented the canonical Expense schema and explicit Space routes. The mobile app signs in with Google through Clerk, lists authorized Spaces, and navigates Dashboard, Expenses, Budget, and Profile. Expense browsing, Budgets, reporting, statement import, manual entry, and sharing actions are present only as unavailable screens so they are not successful workflows.

The native client uses Expo Router and React Native. `npx expo install` selected the SDK 58 compatible set already in this project: `expo` 58.0.16, `react-native` 0.88.0, `expo-router` 58.0.24, plus `@clerk/expo` 4.14.1 and `@clerk/expo-google-signin` 1.1.0. This change does not upgrade the SDK. A local PDF.js parser prototype remains at `/parser-proof` and is not part of the signed-in tab bar.

Android emulator and physical-iPhone sign-in evidence is still required before this journey is accepted. Lint, typecheck, and the navigation tests do not replace that device run.

## Setup and checks

Use Node.js 24.11.1 to match CI. From the repository root:

```bash
npm ci --prefix mobile-app
npm --prefix mobile-app run lint
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run parser:test
npm --prefix mobile-app test
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

Set `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and the Google client IDs in a local `mobile-app/.env.local`; `mobile-app/.env.example` lists them. `src/api/expense-api-client.ts` provides authenticated Space-scoped Expense reads, edits, creation, deletion and Activity requests. `src/api/spaces-api-client.ts` lists Spaces for the signed-in User. The sign-in screen supplies the Clerk session token; the clients do not send a User id. Use `http://10.0.2.2:3000` for an Android emulator reaching the development computer, `http://<computer-lan-address>:3000` for a trusted local network device, or a device-reachable HTTPS URL for a hosted development API. A base URL and client code do not establish backend or device acceptance.

Google sign-in uses the native Clerk flow and requires a development build. Put the public client IDs and `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` in the EAS environment when building a physical iPhone. The `@clerk/expo-google-signin` config plugin reads that scheme from the environment or Expo `extra` during prebuild and adds the iOS URL type. If `CLERK_AUTHORIZED_PARTIES` is set on the API, include the party Clerk places on native session tokens or sign-in will reach the app and then fail when Spaces load.

No screen creates an in-memory draft yet, because statement import and manual Expense entry are not available. The session store still keeps a draft for the same identity after session expiry and drops it on explicit sign-out or a different identity. A missing local access token is a load failure. An HTTP 401 from the API ends the Clerk session and keeps private state for the same identity.

When testing a device against a development backend, use a dedicated development API and PostgreSQL database with a real Google/Clerk test identity. Android emulator `localhost` is the emulator itself; use the emulator host mapping (`10.0.2.2`) for a service running on the development computer, or a device-reachable LAN/HTTPS endpoint for physical devices. Do not expose a production API or use an ordinary financial database. Synthetic API test identities are limited to isolated automated tests and cannot provide physical-device sign-in evidence.

The API's deterministic fictional seed is restricted to a specifically named disposable local database. See the API [seed instructions](../api/README.md#development-seedreset) before using `db:seed` or `db:recreate-seed`. API PostgreSQL automation creates fresh isolated databases; see [local testing](../docs/local-testing.md).

## Release evidence

Record the app/API revisions, native build profile, device model and OS, relevant configuration and observed result. Keep evidence sanitized: do not commit PDF statements, passwords, extracted text, financial screenshots or credentials.

Mobile lint, TypeScript and parser fixture checks are automated software checks only. Personal-use readiness also requires installable native builds, Android emulator and physical-iPhone journey evidence, and the remaining parser limits/device/cleanup checks in [issue #138](https://github.com/yororo/spendeazy/issues/138). No device certification is claimed by CI.

## Design

The current visual source is [mobile-design.pen](mobile-design.pen). Read [design-token.md](design-token.md) before changing colors, typography, spacing or component surfaces.
