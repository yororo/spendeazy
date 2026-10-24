# Mobile agent guidance

This project is the native Android/iPhone client. There is no web platform target. `web/design/` is a legacy visual reference only. Current mobile code remains a starter plus a parser prototype; do not describe the target user journeys as shipped.

## Expo and React Native APIs

Expo changes between SDK releases. Before adding or changing Expo/EAS/React Native APIs, read the version matching `expo` in `package.json` at `https://docs.expo.dev/versions/v<major>.0.0/`. For other Expo topics, use the official `https://docs.expo.dev/llms.txt` index and follow its current documentation.

## Commands

From the repository root:

```bash
npm ci --prefix mobile-app
npm --prefix mobile-app run lint
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run parser:test
```

Run checks regularly. `parser:test` uses fictional fixtures; it does not establish build, device, accessibility or parser launch acceptance. See [mobile setup and evidence](README.md) and [root local testing](../docs/local-testing.md).

## Navigation and native builds

- Use Expo Router. Routes live in `src/app/`; place reusable components and logic elsewhere.
- If `ios/` and `android/` are absent, Expo generates them. Do not edit generated native projects by hand; use app config and config plugins.
- Build a local Android development binary with `npx expo run:android`. Use an EAS internal build for physical iPhone. Expo Go is not the native validation target.
- Do not add browser scripts, web-specific platform files, `react-native-web`, or browser CI gates. The bundled parser's WebView is an internal native component, not a browser client.

## API and identity boundaries

The app has an authenticated Expense API client that takes an access-token provider, but no Clerk sign-in flow or connected user journeys yet. `EXPO_PUBLIC_API_BASE_URL` configures that client; document new settings in the project README. Device journeys need a device-reachable dedicated development API/PostgreSQL database and real Google/Clerk development identities. Never use production financial data. Synthetic identities belong only to isolated automated API tests and do not prove real sign-in on a phone.

## Parser and privacy

PDF selection, unlocking, extraction, provider interpretation and Category Rule matching stay on-device. Do not upload statements/passwords or add remote parsing/Category Suggestions. Preserve selected engine stream order. Use fictional, sanitized fixtures in checked-in tests; keep private documents, passwords, raw text and financial screenshots out of Git and issue comments.

The parser launch envelope, older-device support and temporary-file cleanup remain blocked on [issue #138](https://github.com/yororo/spendeazy/issues/138). Do not present the provisional 10 MiB/100-page proof guards as supported limits. Record native build/device evidence separately from lint, type and fixture results.

## Visual design

Read [design-token.md](design-token.md) and use the current [mobile design source](mobile-design.pen). The duplicate glossary is a pointer to the root [GLOSSARY.md](../GLOSSARY.md).
