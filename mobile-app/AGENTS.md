# Mobile agent guidance

This project is the native Android/iPhone client. There is no web platform target. `web/design/` is a legacy visual reference only. The app has Google sign-in, Dashboard, Expenses, Budget, and Profile navigation, device Appearance, and an authorized Space switcher. Manual Expense creation, active and Deleted Expenses browsing, revision-protected edit, soft-delete and per-Expense Activity, Shared Space Invite Code management, read-only Statement Import history, and atomic Category/Budget/Rule configuration flows talk to the API. Statement import and reporting workflows are not implemented; do not describe those journeys as shipped. A local PDF.js parser prototype remains on `/parser-proof` and is not a product tab.

## Coding standards

For mobile code creation, modification, or review, read [coding standards](docs/CODING_STANDARDS.md).

## Expo and React Native APIs

Expo changes between SDK releases. Before adding or changing Expo/EAS/React Native APIs, read the version matching `expo` in `package.json` at `https://docs.expo.dev/versions/v<major>.0.0/`. For other Expo topics, use the official `https://docs.expo.dev/llms.txt` index and follow its current documentation.

## Commands

From the repository root:

```bash
npm ci --prefix mobile-app
npm --prefix mobile-app run lint
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run parser:test
npm --prefix mobile-app test
```

Run checks regularly. The mobile CI job runs these four commands, and a failure fails the job. `parser:test` uses fictional fixtures. `npm test` is the application regression suite. Neither command, nor a green CI run, establishes build, device, accessibility, emulator, or parser launch acceptance. See [automated checks](../docs/local-checks.md) and the [manual runbook](../docs/local-testing.md).

## Navigation and native builds

- Use Expo Router. Routes live in `src/app/`; place reusable components and logic elsewhere.
- If `ios/` and `android/` are absent, Expo generates them. Do not edit generated native projects by hand; use app config and config plugins.
- Follow the [manual runbook](../docs/local-testing.md) for parser asset preparation, Android builds, Expo reload/rebuild decisions and physical iPhone setup. Expo Go is not the native validation target.
- Do not add browser scripts, web-specific platform files, `react-native-web`, or browser CI gates. The bundled parser's WebView is an internal native component, not a browser client.

## API and identity boundaries

Mobile documents describe API features by the exposed endpoints in the [OpenAPI contract](../api/docs/openapi.yaml), the source of truth for shipped API behavior. API source paths and code stay in the API project.

The app signs in with Clerk Google authentication and sends that session token to the Expense and Spaces API clients. `EXPO_PUBLIC_API_BASE_URL` and the Clerk/Google settings in `.env.example` configure the client; document new settings in the project README. The API derives the actor from that token. Device-remembered Appearance is shared on the device. The last active Space is stored per signed-in identity and falls back to Personal. Explicit sign-out drops in-memory private state; session expiry keeps it for the same identity only. Device journeys need a device-reachable dedicated development API/PostgreSQL database and real Google/Clerk development identities. Never use production financial data. Synthetic identities belong only to isolated automated API tests and do not prove real sign-in on a phone.

## Parser and privacy

PDF selection, unlocking, extraction, provider interpretation and Category Rule matching stay on-device. Do not upload statements/passwords or add remote parsing/Category Suggestions. Preserve selected engine stream order. Use fictional, sanitized fixtures in checked-in tests; keep private documents, passwords, raw text and financial screenshots out of Git and issue comments.

The parser launch envelope, older-device support and temporary-file cleanup remain blocked on [issue #138](https://github.com/yororo/spendeazy/issues/138). Do not present the provisional 10 MiB/100-page proof guards as supported limits. Record native build/device evidence separately from lint, type and fixture results.

## Visual design

Read [design-token.md](design-token.md) and use the current [mobile design source](mobile-design.pen). The duplicate glossary is a pointer to the root [GLOSSARY.md](../GLOSSARY.md).
