# Spendeazy mobile

## Expense API foundation

Use the shared [root glossary](../GLOSSARY.md), [Expense domain and mobile API contract](../docs/specifications/mobile-expense-domain-api.md), and [replacement ADR](../docs/adr/0004-mobile-expense-domain-and-contract.md) for the accepted target. Shipped API behavior is the exposed endpoints in the [OpenAPI contract](../api/docs/openapi.yaml). The mobile app signs in with Google through Clerk, lists authorized Spaces, creates manual Expenses, and browses and reads Expenses. Editing, deletion, Budgets, reporting, statement import and sharing actions remain unavailable.

The native client uses Expo Router and React Native. `npx expo install` selected the SDK 58 compatible set already in this project: `expo` 58.0.16, `react-native` 0.88.0, `expo-router` 58.0.24, plus `@clerk/expo` 4.14.1 and `@clerk/expo-google-signin` 1.1.0. This change does not upgrade the SDK. A local PDF.js parser prototype remains at `/parser-proof` and is not part of the signed-in tab bar.

Android emulator and physical-iPhone sign-in evidence is still required before this journey is accepted. Lint, typecheck, and the navigation tests do not replace that device run.

## Coding standards

For mobile implementation and review, follow the [coding standards](docs/CODING_STANDARDS.md).

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

Set `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and the Google client IDs in a local `mobile-app/.env.local`; `mobile-app/.env.example` lists them. The signed-in client calls the [OpenAPI contract](../api/docs/openapi.yaml): `GET /api/v1/users/me/spaces` lists Spaces; `GET` and `POST /api/v1/users/me/spaces/{spaceId}/expenses` list and create Expenses; `GET`, `PATCH`, and `DELETE /api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}` read, edit, and delete an Expense; `GET /api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}/activity` lists Activity. The sign-in screen supplies the Clerk session token; requests do not send a User id. Use `http://10.0.2.2:3000` for an Android emulator reaching the development computer, `http://<computer-lan-address>:3000` for a trusted local network device, or a device-reachable HTTPS URL for a hosted development API. A base URL and client code do not establish backend or device acceptance.

Google sign-in uses the native Clerk flow and requires a development build. Put the public client IDs and `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` in the EAS environment when building a physical iPhone. The `@clerk/expo-google-signin` config plugin reads that scheme from the environment or Expo `extra` during prebuild and adds the iOS URL type. If `CLERK_AUTHORIZED_PARTIES` is set on the API, include the party Clerk places on native session tokens or sign-in will reach the app and then fail when Spaces load.

The [session capability](src/application/session.ts) owns identity, Clerk session and Space transitions. Manual Expense input is kept in memory across expiry for the same identity. Explicit sign-out clears that draft and the Expense browse selection immediately; a different identity starts empty. Changing Space clears the selected Category, browse filters and scroll while preserving entered amount, description and date. Remembered active Spaces remain device preferences keyed by identity.

All current Spaces, Categories, Expense list/detail and manual submission requests use the [session request boundary](src/application/session-request.ts). Missing local credentials produce a sign-in issue without ending the session. HTTP 401 locks private routes and initiates one Clerk recovery; transport errors and invalid responses remain retryable issues. Requests check both their application scope and live Clerk credentials before reacting to outcomes. A delayed failure cannot terminate a replacement Clerk session. If Clerk termination fails, the sign-in action retries it before starting Google authentication.

The [Spaces workflow](src/application/spaces/workflow.ts) owns accessible selection, refresh and device-memory writes. [Expense controllers and views](src/features/expenses/) consume the session capability; routes retain navigation. Private work is volatile and does not survive process termination. Statement Import remains a prototype and has not migrated to this capability; future Budget, editing, deletion and sharing controllers must adopt these boundaries when implemented.

The [Expense browse workflow](src/features/expenses/browse-workflow.ts) owns replacement, refresh, pagination and retry. Refresh invalidates any pending page; a late success or failure cannot restore older rows or clear the current loading state. Failed pagination keeps existing rows and retries the same cursor. Filters, full-selection totals and detail-return scroll memory remain owned by the Expense feature.

The [Expense detail workflow](src/features/expenses/detail-workflow.ts) loads one Expense for the signed-in identity, active Space and Expense. `GET /api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}` is decoded by the shared Expense adapter before the workflow accepts it. Retry, and a change of identity, Space or Expense, discard an older success or failure. Transport failures, unreadable responses and API rejections become retryable feature state. The view renders loading, error, recovery and loaded amount, date, description, Category, Account/source and Added By from supplied state. The route owns the Expense parameter, Back and navigation. Editing, deletion, Activity and import inspection are not part of this screen.

`npm test` covers the adapter, browse and detail workflow races, and views rendered with supplied state and a native host substitute. These checks do not establish device accessibility or native acceptance. Native accessibility and installable-build evidence remain tracked separately in [#157](https://github.com/yororo/spendeazy/issues/157), [#158](https://github.com/yororo/spendeazy/issues/158) and parser launch [#138](https://github.com/yororo/spendeazy/issues/138).

The [manual Expense feature](src/features/expenses/use-manual-expense.ts) owns Category loading/retry and submission. Its [preparation operation](src/features/expenses/manual-draft.ts) returns field issues or normalized input using explicit time and destination-scoped Category eligibility. The view receives display state and intent callbacks; the route handles successful navigation after checking the initiating scope and form lifetime. Disposing the form invalidates its pending completion, including same-Space re-entry, without clearing retained draft work. Submission accepts one save at a time and remains completed after success. Expected failures preserve entered values; transport and invalid-response errors explain that the Expense may already exist. Retrying creation is an explicit User action, never an automatic replay. The API still enforces authorization, writable Space access and Category eligibility at save time. Manual preparation, workflow races, creation response decoding and supplied-state view checks run in `npm test`.

When testing a device against a development backend, use a dedicated development API and PostgreSQL database with a real Google/Clerk test identity. Android emulator `localhost` is the emulator itself; use the emulator host mapping (`10.0.2.2`) for a service running on the development computer, or a device-reachable LAN/HTTPS endpoint for physical devices. Do not expose a production API or use an ordinary financial database. Synthetic API test identities are limited to isolated automated tests and cannot provide physical-device sign-in evidence.

The API's deterministic fictional seed is restricted to a specifically named disposable local database. See the API [seed instructions](../api/README.md#development-seedreset) before using `db:seed` or `db:recreate-seed`. API PostgreSQL automation creates fresh isolated databases; see [local testing](../docs/local-testing.md).

## Release evidence

Record the app/API revisions, native build profile, device model and OS, relevant configuration and observed result. Keep evidence sanitized: do not commit PDF statements, passwords, extracted text, financial screenshots or credentials.

Mobile lint, TypeScript and parser fixture checks are automated software checks only. Personal-use readiness also requires installable native builds, Android emulator and physical-iPhone journey evidence, and the remaining parser limits/device/cleanup checks in [issue #138](https://github.com/yororo/spendeazy/issues/138). No device certification is claimed by CI.

## Design

The current visual source is [mobile-design.pen](mobile-design.pen). Read [design-token.md](design-token.md) before changing colors, typography, spacing or component surfaces.
