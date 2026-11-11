# Google and Clerk setup for local testing

Part of the [local runbook](local-testing.md). Commands are Bash.

## Web client ID

Copy public client IDs from the environment when already set. Otherwise take the web client ID from the Clerk instance's Google connection. If Google One Tap is enabled, the instance's public Frontend API environment exposes it as `display_config.google_one_tap_client_id`.

## Android debug signing SHA-1

The Android OAuth client must match package `com.seyfsasy.spendeazymobile` and the installed build's signing SHA-1.

```bash
# cwd: mobile-app
npx expo prebuild --platform android   # only if mobile-app/android/ is absent
cd android && ./gradlew signingReport
```

- `expo prebuild` and `expo run:android` create `mobile-app/android/app/debug.keystore` when none exists.
- Reuse the debug keystore already registered on the Android OAuth client, or register this build's SHA-1. A new keystore does not match a client registered for another machine.

## Checks when Google reports a configuration/developer error

- Web and Android client IDs in `mobile-app/.env.local` match the Clerk instance.
- Android package and SHA-1 match the installed build.
- iOS bundle ID and URL scheme match the installed build (see [iPhone testing](local-testing-iphone.md)).
