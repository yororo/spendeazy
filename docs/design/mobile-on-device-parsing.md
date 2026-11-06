# Design: on-device Statement Import parsing (mobile)

Status: draft for review. Evidence: proof of concept on branch `cursor/on-device-pdf-parse-poc-b667` ([PR #122](https://github.com/yororo/spendeazy/pull/122), `mobile-poc/`, not for merge).

## Goal

Parse a Statement Import PDF on the phone, with no backend call, and produce exactly the same extracted text and parse result as the web app.

Out of scope: authentication, API client, categorization UI, import commit. Those reuse existing API contracts later.

## Decision

Run the web app's pdf.js build inside a hidden, offline WebView. Run the shared TypeScript statement parsers in React Native (Hermes).

```text
pick PDF (expo-document-picker)
  -> read bytes, delete picker cache copy
  -> base64 -> postMessage -> hidden WebView (file:// HTML, one classic IIFE)
       pdf-parse / pdfjs-dist, worker runs in-thread
       getText({ pageJoiner: "" }), stopAtErrors: true
  <- pages[] (or error code: password | unreadable)
  -> join pages with "\n" in React Native
  -> transformStatement() from web/src (bundled, Hermes)
  -> provider, transactions, total
```

### Why this shape

| Option | Verdict |
| --- | --- |
| pdf.js in WebView (chosen) | Same engine and version as web, so text is byte-identical. Pure JS, no native module. |
| pdf.js directly in Hermes | Rejected. pdf.js expects browser APIs (DOM, workers, `structuredClone`, streams); polyfilling is fragile. |
| Native PDF libs (PDFKit / PdfRenderer / pdfium) | Rejected. Different text ordering and whitespace than pdf.js, so the regex parsers would diverge per platform. |
| Server-side parsing | Rejected. Sends statements off device; goal is local-only. |

## Components

| Component | Responsibility |
| --- | --- |
| `scripts/build-bundles.mjs` | esbuild: (1) parser bundle from `web/src/features/statement-import/statement-parser/transformer.ts` + `shared/money` (CJS, for Metro); (2) WebView IIFE from `pdf-parse` browser build + worker, inlined into a single HTML file with a network guard banner; (3) manifest with versions and SHA-256s. Fails the build if the parser bundle contains `createApiClient`, `@clerk/`, or a CDN URL. |
| `src/pdf-webview.tsx` | Writes the HTML to the app cache, loads it via `file://`, request/response over `postMessage` with ids and timeouts. |
| `src/parse-statement.ts` | Joins pages, SHA-256 of text, calls `transformStatement`, maps errors to codes. |
| `plugins/without-internet.js` | Expo config plugin that strips `android.permission.INTERNET` (including from merged library manifests via `tools:node="remove"`). |
| Self-test (button + `spendeazy-parser-poc://self-test`) | Parses bundled fixtures, checks against `src/baseline.json` (Node-generated), wrong-password case, network probes. |

Parsers and fixtures are not copied: they are bundled from `web/src` and `web/e2e/fixtures` at build time, so web stays the single source of truth.

## Package versions (POC)

| Package | Version |
| --- | --- |
| expo | ~58.0.12 |
| react-native | 0.88.0 |
| react | 19.3.0 |
| react-native-webview | 14.0.1 |
| pdf-parse | 2.4.5 (pinned, same as `web/package.json`) |
| pdfjs-dist | 5.4.296 (transitive via pdf-parse) |
| expo-asset | ~58.0.16 |
| expo-crypto | ~58.0.6 |
| expo-dev-client | ~58.0.13 |
| expo-document-picker | ~58.0.4 |
| expo-file-system | ~58.0.9 |
| expo-linking | ~58.0.13 |
| expo-status-bar | ~58.0.3 |
| esbuild (dev) | ^0.28.2 |
| playwright (dev) | ^1.64.1 |
| typescript (dev) | ~6.0.3 |
| @types/react (dev) | ~19.3.0 |

## Findings, gotchas, workarounds

1. **No module scripts from `file://`.** `<script type="module">` is blocked, and a separate worker file cannot be loaded. Workaround: bundle everything into one classic IIFE and set `globalThis.pdfjsWorker = { WorkerMessageHandler }` so pdf.js runs the worker in-thread. Cost: parsing blocks the WebView's JS thread (fine, it's hidden).
2. **Do not reuse `pdf-extractor.ts`.** It points pdf.js at a Vite worker URL (`import.meta.env.BASE_URL`). The WebView entry duplicates its options (`stopAtErrors: true`, `pageJoiner: ""`) and error codes. These must be kept in sync; extract them to a shared module in production.
3. **Page joining happens outside pdf.js.** Web joins pages with `"\n"` after `getText`. Mobile must do the same, or SHA-256 parity fails.
4. **HTML size ~1.5 MB.** Inlined into a TS string module, written to `Paths.cache` at startup, loaded with `allowFileAccess` + `allowingReadAccessToURL`. `cacheEnabled={false}`. Consider lazy-loading it only when the import screen opens.
5. **`originWhitelist={['*']}` is intentional.** A whitelist miss makes `react-native-webview` open the URL in the system browser, which is itself a network request. Blocking is done in `onShouldStartLoadWithRequest` (allow only `file:`, `about:`, `data:`, `blob:`).
6. **Defense in depth for offline:** CSP `connect-src 'none'` (plus everything else `'none'`), `fetch` / XHR / WebSocket / `sendBeacon` / `EventSource` replaced to reject and record remote URLs, no CMap / standard-font / CDN URLs configured, Android `INTERNET` permission removed. Note: in a debug build Metro still connects to the dev machine; use a release build to verify offline behavior.
7. **Binary transfer is base64 over `postMessage`.** Simple and works on both platforms; ~33% overhead. Acceptable for statement-sized PDFs; revisit for large files.
8. **TypeScript 6 vs WebView props.** SDK 58's `WebView` prop intersection collapses to `never`. Workaround: cast to a narrowed local props type.
9. **Metro and the monorepo.** `watchFolders` includes `web/e2e/fixtures`; `disableHierarchicalLookup` + local `nodeModulesPaths` stop Metro from resolving `web/node_modules`.
10. **Expo Go cannot run this** (custom config plugin, dev client). Use a local development build (`npx expo run:android|ios`). No EAS or Expo account required.
11. **Delete the picker cache copy** after reading bytes; never log statement text (only aggregates and SHA-256).

## Verification results

| Target | Result |
| --- | --- |
| Node baseline | Reference SHA-256; BDO, 4 transactions, 200001 cents; wrong password -> `PasswordException`. |
| Playwright Chromium, `file://` | Identical SHA-256 and fields, 0 remote requests, ~16 ms (plain). |
| Playwright WebKit, `file://` | Identical, 0 remote requests, ~30 ms (plain). |
| Android emulator (API 35, WebView 124) | Not completed. Release APK builds on Linux without `INTERNET`, RN UI renders, but the WebView renderer crashes (SIGTRAP in `libwebviewchromium.so`). |
| iOS | Not run (needs Mac + Xcode). |

Android emulator gotcha: on the CI VM, KVM is unusable (kernel BUG on vCPU create), so the emulator ran with `-accel off`. SwiftShader only exposes GLES 3.0; WebView needs 3.1+ and crashes even on a one-line page, so this is an environment limit, not the bundle. `-gpu swangle` killed the system server. A physical device or a GPU/KVM-capable host is required.

## Open items before production

- Run the self-test on a physical Android device and an iOS simulator/device.
- Measure memory and time on low-end Android with multi-page real statements; consider a size limit.
- Move shared extractor options and error codes out of `pdf-extractor.ts` into a platform-neutral module consumed by web and mobile.
- Add a CI parity check: Node baseline SHA-256 must equal WebView SHA-256 (Playwright Chromium + WebKit) on every `pdf-parse` bump.
- Decide whether pdf.js upgrades are lockstep across web and mobile (recommended: yes, single pinned version).
- Replace debug keystore; define real app ids and distribution.
