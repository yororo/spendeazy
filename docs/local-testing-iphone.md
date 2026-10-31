# Physical iPhone testing

Part of the [local runbook](local-testing.md). Requires an Expo account and Apple Developer membership. Commands are Bash.

From Windows, use EAS cloud builds; local iOS builds and the simulator need macOS and Xcode.

## Configuration

- Set the Google iOS client ID and reversed-client-ID URL scheme from `mobile-app/.env.example`.
- Put the same public Clerk/Google build settings in the EAS **development** environment so the remote config plugin receives the iOS URL scheme. A gitignored `.env.local` is not available to the remote build; it only configures Metro-served JavaScript. See [EAS environment setup](https://docs.expo.dev/eas/environment-variables/manage/).
- `EXPO_PUBLIC_API_BASE_URL` must be a LAN/HTTPS URL the iPhone can reach (not `10.0.2.2`).

## Build and run

```bash
# cwd: mobile-app
npx eas-cli@latest device:create
npx eas-cli@latest build --profile development --platform ios
```

Install the build on the registered iPhone and enable Developer Mode when prompted. Then:

```bash
# cwd: mobile-app
npm run statement-import:prepare
npx expo start --dev-client
```

Open the development server from the device. Native configuration changes require another build. See [internal distribution](https://docs.expo.dev/build/internal-distribution/).

## Without Metro

Use the EAS `preview` profile, with its build environment pointing at the dedicated development backend.
