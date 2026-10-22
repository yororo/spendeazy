# Official Expo stack and Windows-to-iPhone workflow

Research date: 2026-10-22 (Asia/Manila). Evidence for [Verify the official Expo stack and Windows-to-iPhone development workflow](https://github.com/yororo/spendeazy/issues/125), within [Chart the Spendeazy mobile replacement specification](https://github.com/yororo/spendeazy/issues/124).

## Conclusion

Target stable **Expo SDK 58, React Native 0.88 and React 19.3.0**, using Expo Router and development builds. SDK 58 was released on October 15, 2026; this is a published release, not an inference from the starter manifest. Its release announcement still warns that SDK 58 Expo Go store binaries will arrive later. Do not make Expo Go a prerequisite for this project. [Expo SDK 58 release](https://expo.dev/changelog/sdk-58)

The versioned SDK matrix confirms that pairing and a minimum Node.js version of 22.13.x. It lists Android 7+, iOS 16.4+, Android compile SDK 37/target SDK 36, and Xcode 26.4+; these are framework support limits, not a promise that all future parser dependencies support the same floor. Follow the SDK-compatible dependency set rather than independently choosing the newest React Native version. [SDK 58 compatibility matrix](https://docs.expo.dev/versions/v58.0.0/)

Recommendation: retain the existing starter and align its lockfile through Expo's compatibility tools during implementation. The inspected repository manifest at commit `67de6bbd85c2fe00a6bca69fbe0995f9f9ad0d4f` declares `expo ~58.0.16`, `react-native 0.88.0`, `react 19.3.0`, Expo Router, dev client and Reanimated; this agrees at the release-family level. No installed package audit or exact latest patch claim is made here. [Starter manifest](https://github.com/yororo/spendeazy/blob/67de6bbd85c2fe00a6bca69fbe0995f9f9ad0d4f/mobile-app/package.json)

## Build and test workflow

| Target | Recommended route | Prerequisites |
| --- | --- | --- |
| Android emulator on Windows | Local Expo Android development build; EAS cloud APK is an alternative | Android Studio, SDK/JDK setup, running emulator, compatible Node/npm |
| Physical iPhone from Windows | EAS cloud development build, installed on the registered iPhone | Expo project/account, paid Apple Developer membership, signing and provisioning, device registration, Developer Mode |
| iOS native debugging locally | A Mac with Xcode when needed | Not available directly on the Windows laptop |

Expo CLI can compile Android with `npx expo run:android`, install on a running emulator, and start Metro. Local iOS compilation requires Xcode. Its first build generates native directories when absent; keep native configuration in app configuration/config plugins and local modules, consistent with this repository's mobile guidance. [Local compilation](https://docs.expo.dev/guides/local-app-development/)

EAS builds in the cloud and supports iOS build requests from any operating system. Use `expo-dev-client` so application-specific native dependencies are included. JavaScript-only iterations reuse the installed binary; native dependency or configuration changes require another native build. [Development builds](https://docs.expo.dev/develop/development-builds/introduction/), [rebuild guidance](https://docs.expo.dev/develop/development-builds/use-development-builds/)

The EAS iPhone route uses an Apple Developer account and a device provisioning profile. Register the iPhone with `npx eas-cli@latest device:create`, then build the device profile with `npx eas-cli@latest build --platform ios --profile development`. These are future setup commands, not commands executed by this research. Use a device build, not `ios.simulator: true`. [Physical-device tutorial](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/)

Internal iOS distribution uses ad hoc provisioning with an allowed list of device UDIDs. Adding a device needs a new provisioned build or re-signing. This route requires paid Apple membership. Local Xcode signing is a separate alternative for someone with a Mac; it is not the selected Windows workflow. [Internal distribution](https://docs.expo.dev/build/internal-distribution/)

Enable iPhone Developer Mode for internal development builds. On a Windows-only workflow, install the build and follow the on-device Settings prompt; a Mac is not required for that activation path. [Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)

Run `npx expo start --dev-client` from `mobile-app/` after installation. Open Android from the CLI or scan its QR code on the iPhone. Development builds can connect to Metro on the local network. Native changes must be rebuilt on both targets. [Using a development build](https://docs.expo.dev/develop/development-builds/use-development-builds/)

Do not confuse local `expo run:android` with `eas build --local`: Expo explicitly does not support Windows for the latter, including unofficial WSL attempts. Use the supported local Android toolchain or EAS cloud. [EAS local-build limitations](https://docs.expo.dev/build-reference/local-builds/)

## On-device parsing implications

Expo's document picker selects a document through the platform UI. Set `copyToCacheDirectory: true` when immediate file-system access is required. Selection may involve a cloud file provider downloading the user's chosen file; that is distinct from uploading statement contents to a parser service. Parsing starts only once bytes are available locally. [DocumentPicker](https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/)

A native PDF parser can be incorporated through a local Expo module under `mobile-app/modules/`; Expo documents `npx create-expo-module@latest --local` as the supported starting point. That provides an integration seam, not proof of a specific PDF engine's text ordering, password support, licensing or performance. Those remain the separate parser investigation and device validation. [Local Expo modules](https://docs.expo.dev/modules/get-started/)

Project constraint: BDO Amex, EastWest Visa and GCash PDF parsing, reconciliation and Category Rule matching stay on-device. No PayPal/CSV, remote suggestions or cloud parsing fallback. Recommended boundary: file bytes and passwords stay local; only reviewed, confirmed Expenses and necessary import metadata reach the API. Log and crash-report payload policies must enforce that boundary. A cloud service compiling the application is not a cloud service parsing its statements. These are project requirements and architecture recommendations, not claims of implemented privacy controls. [Map's confirmed constraints](https://github.com/yororo/spendeazy/issues/124)

## API connectivity and authentication boundary

React Native supports `fetch`. iOS ATS and modern Android cleartext defaults constrain HTTP connections; prefer HTTPS with trusted certificates rather than globally disabling protections. Recommendation: provide one authenticated development API URL reachable by both devices. The Metro bundle address and the API base URL are separate; proving one works does not prove the other. [React Native networking](https://reactnative.dev/docs/network)

For an Android emulator, `10.0.2.2` is the special alias for the Windows host's loopback interface. The physical iPhone needs its own reachable API address; the emulator alias is not an iPhone solution. [Android emulator address space](https://developer.android.com/studio/run/emulator-networking-address)

The existing synthetic launcher binds its API to loopback and supplies test-only identities. It is not already a physical-iPhone backend. Define a deliberate mobile test environment later rather than exposing that synthetic service indiscriminately. [Repository local testing guidance](https://github.com/yororo/spendeazy/blob/67de6bbd85c2fe00a6bca69fbe0995f9f9ad0d4f/docs/local-testing.md)

Recommendation: store authentication secrets through the authentication SDK's supported secure-storage integration, backed by SecureStore where appropriate. SecureStore supplies encrypted local key/value storage; it is not a statement-file store. The exact Clerk mobile integration, refresh/revocation behavior and deep links still need their own implementation contract and tests. [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)

## Navigation, appearance and motion

Use Expo Router for the app's routes, with route files under `src/app/` and domain/UI modules outside that directory per repository guidance. Expo Router is the official file-based navigation option. During the SDK 58 transition, unqualified `create-expo-app@latest` can still create SDK 57; if a disposable reference app is ever needed, explicitly select `default@sdk-58`. The current starter need not be recreated. [Expo Router](https://docs.expo.dev/router/introduction/)

Build the design system as semantic light/dark tokens and reusable React Native components derived from the design file, not an extra selectable theme product. Expo supports automatic light/dark appearance with `userInterfaceStyle`; Android development builds require `expo-system-ui` for this configuration. Whether the settings screen permits an override remains a design decision. [Appearance configuration](https://docs.expo.dev/develop/user-interface/color-themes/)

Use the SDK-compatible Reanimated/worklets pair for restrained transitions and interaction feedback. SDK 58's page recommends Reanimated 4.7.1 and `npx expo install react-native-reanimated react-native-worklets`. Exact package compatibility should be rechecked before implementation; do not copy unrelated Babel setup from older tutorials. [Reanimated reference](https://docs.expo.dev/versions/v58.0.0/sdk/reanimated/)

Recommendation: brief button press, sheet and confirmation transitions; respect reduced-motion settings and avoid animating large statement lists unnecessarily. Optional Expo Haptics can reinforce deliberate actions, but the same action must remain understandable without vibration. [Haptics capabilities](https://docs.expo.dev/versions/v58.0.0/sdk/haptics/)

Bundle the design's Outfit font using Expo Font, with a readable fallback and real-device font-scaling verification. Bundled fonts avoid runtime font-download dependence. Token values, contrast, touch targets and platform adaptations belong to the design-system decision, not this stack research. [Expo Font](https://docs.expo.dev/versions/v58.0.0/sdk/font/)

## Implementation verification checklist

The following are future acceptance gates, not completed results:

- Revalidate latest stable SDK and the installed lockfile; run `npx expo install --check`, `npx expo-doctor`, mobile lint and TypeScript checks with project dependencies installed.
- Build and launch the native dev client on the Windows Android emulator and the actual iPhone. Confirm SDK 58 OS/toolchain compatibility, signing, deep links and Metro connectivity independently on each.
- Exercise sign-in, token refresh, sign-out, an authenticated API read and Expense save against the intended HTTPS API. Check denial/expired-session behavior.
- Run representative PDF fixtures on both native targets: encrypted/password retry, non-ASCII descriptions, multi-page ordering, totals, cancellation, malformed inputs and low-memory cases. Test airplane-mode parsing of already-local documents and verify zero network dependency for parsing/rule matching.
- Verify no document bytes, passwords or raw extracted text leave the device through logs, analytics or error reporting. Define cleanup and interrupted-import behavior.
- Review light/dark states, font scaling, screen reader labels, reduced motion, keyboard/safe-area behavior and Android back/iOS gestures against the design.
- Use a release-like build for parser performance and large-list responsiveness; a browser test or Expo Go demo cannot validate a native parser.

## Evidence limits and checks for this report

Primary official documentation was read on the research date; generic search results and unversioned indexes were observed lagging SDK 58. The dated release announcement and SDK 58 matrix take precedence for the release conclusion. No exact newest patch audit was performed.

Only this Markdown report is changed. No dependency installation, source changes, credentials provisioning, native builds or device tests were performed. Apple membership, device OS, Android toolchain, API reachability and native parser compatibility are unverified prerequisites, not research blockers.

`npm --prefix mobile-app run lint` was attempted in the isolated worktree and could not start because `expo` is not installed there. The TypeScript dependency preflight likewise found no installed compiler. Installing dependencies was excluded from this research task. The parent session attempted the repository-required `node scripts/local-test-launcher.mjs --e2e`; it stopped before tests because Docker Desktop's Linux engine named pipe was unavailable. No runtime check is claimed as passing. The document diff is checked for whitespace and task-only scope before commit.
