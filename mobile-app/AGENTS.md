# Mobile agent guidance

This project is the native Android/iPhone client.

## Coding standards

Refer to [coding standards](CODING_STANDARDS.md).

## Expo and React Native APIs

Expo changes between SDK releases. Before adding or changing Expo/EAS/React Native APIs, read the version matching `expo` in `package.json` at `https://docs.expo.dev/versions/v<major>.0.0/`. For other Expo topics, use the official `https://docs.expo.dev/llms.txt` index and follow its current documentation. 

## Navigation and native builds

- Use Expo Router. Routes live in `src/app/`; place reusable components and logic elsewhere.
- If `ios/` and `android/` are absent, Expo generates them. Do not edit generated native projects by hand; use app config and config plugins.
- Follow the [manual runbook](../docs/testing/LOCAL_TESTING.md) for parser asset preparation, Android builds, Expo reload/rebuild decisions and physical iPhone setup. Expo Go is not the native validation target.
- Do not add browser scripts, web-specific platform files, `react-native-web`, or browser CI gates. The bundled parser's WebView is an internal native component, not a browser client.

## API and identity boundaries

Mobile documents describe API features by the exposed endpoints in the [OpenAPI contract](../api/docs/openapi.yaml), the source of truth for shipped API behavior. API source paths and code stay in the API project.

Document new `.env.example` settings in the project README. Never use production financial data.

## Parser and privacy

PDF selection, unlocking, extraction, provider interpretation and Category Rule matching stay on-device. Do not upload statements/passwords or add remote parsing/Category Suggestions. Preserve selected engine stream order. Use fictional, sanitized fixtures in checked-in tests; keep private documents, passwords, raw text and financial screenshots out of Git and issue comments.

## Visual design

The UX is **minimalist and simple: icons and short intuitive labels over text**. Read [UX_PRINCIPLES.md](design/UX_PRINCIPLES.md) before any UI or copy change, including animations.

For any change that designs the user interface (especially new elements, screens or components), treat [DESIGN_TOKEN.md](design/DESIGN_TOKEN.md) and the [mobile design source](design/mobile-design.pen) as the authoritative sources for visual values.

## Users

The [USER_PERSONA](USER_PERSONA.md) describes the target users of this application. Refer to it when challenging existing/future features and coming up with the UX design.
