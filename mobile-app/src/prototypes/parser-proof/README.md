# Throwaway on-device PDF.js proof

Question: can a bundled PDF.js engine preserve the supported statement semantics
on Android and physical iPhone? This branch is an experiment to review, not the
production import feature or an approved parser choice.

For [Validate the on-device parser approach on Android and iPhone](https://github.com/yororo/spendeazy/issues/130).
User selected PDF.js and supplied one local encrypted BDO Amex PDF. Do not merge
this experiment into the production app. Keep the ticket open until the remaining
device/fixture evidence and human review exist.

## Run

From `mobile-app/`, `npm run parser:proof` prepares all local assets and starts
Metro for a development client. Open **Parser proof** in the bottom tabs. Native
modules require a fresh development binary: `npx expo run:android` on Windows,
or an EAS iOS development build using existing project provisioning.

The command binds only IPv4 localhost and limits Metro to two workers. After
installing the Android binary, press `a` in Expo CLI to open it on the emulator;
ADB reverse connects the local development port. This does not expose Metro to
the LAN. Physical-iPhone review uses the bundled internal preview build below.

For an iPhone build with JavaScript bundled, use the existing `preview` internal
EAS profile. `eas-build-post-install` generates the bundled engine before Metro
builds the app. This permits offline cold-start testing; a Metro session alone
cannot establish that property. Install the signed build on the registered
iPhone, enable Developer Mode if prompted, and select a PDF already downloaded
in Files. No statement/password goes into the build or source.

1. Choose PDF without a password: expect a local password challenge.
2. Enter a deliberately wrong password: expect local retry.
3. Enter the correct password, preserving spaces: observe page progress and UI
   heartbeat, then review all Transactions against the PDF. Record only sanitized
   evidence. No raw text, filenames, passwords, or financial values in Git/issues.
4. Switch **engine stream / spatial lines**. Check repeated headers, line wraps,
   dates/signs, references, duplicate-looking rows, and provider control totals.
5. Cancel during extraction, retry immediately, background/foreground, leave the
   route, and terminate/reopen. Cancel destroys the WebView worker and ignores
   late results. Cancellation discards the draft; backgrounding retains it only
   while the OS keeps the process alive. Verify, do not infer, these behaviors.
6. Run from a fully bundled binary in airplane mode, Wi-Fi disabled, with a local
   PDF. Capture network evidence separately; CSP and a navigation filter alone
   are not packet-capture evidence. There is no API client/suggestion service.
7. Inspect native process memory, WebView child-process memory, elapsed time,
   repeated-run retention and UI responsiveness. The UI shows elapsed extraction
   time; it does not claim to measure native peak memory.

## Boundaries and intentional incompleteness

- Pinned PDF.js **5.4.296**; SDK-compatible WebView **14.0.1**, DocumentPicker
  **58.0.4**, FileSystem **58.0.10**, Expo **58.0.16**, RN **0.88.0**. These are
  experiment versions, not a newest-patch or security certification.
- `webview-entry.ts`: PDF bytes/password in, page-indexed text/geometry out.
  Matching engine and worker plus CMaps/font resources are embedded. No CDN.
  WASM image decoding is disabled; this is text extraction, not OCR/rendering.
  CSP restricts network connections to local blob/data. Document JavaScript,
  attachments and interactive actions are not executed.
- `extraction.ts`: experimental page-to-text reconstruction, separate from
  engine and provider interpretation. Desktop BDO evidence favors engine stream;
  spatial regrouping currently fails provider validation.
- `providers/`: read-only snapshots of the pure web transformers at `69055e9`,
  with local money/description helpers and import paths. `web/` is unchanged.
  **Legacy reconciliation throws** and **GCash direction is heuristic**: neither
  represents the approved mobile warning-and-continue/direction contract. A
  failed transformer must retain readable extraction evidence, never masquerade
  as a successful import or selected production implementation.
- `rules.ts`: fictional, in-memory Exact/Contains/ambiguous/inactive Category
  probes. No API or persisted rules. Manual-assignment/draft-rule lifecycles
  belong to later implementation; this proof does not implement them.
- `screen.tsx`: temporary PDF copy and password live only for extraction/retry.
  Finish/discard/unmount deletes the picker-created copy; never the original.
  Termination during parsing can leave an OS cache copy; startup stale-copy
  cleanup remains unimplemented and must be proven before production selection.
- The 10 MiB / 100-page caps are temporary investigation guards, not launch
  limits derived from measurements. Image operations/blank pages raise explicit
  completeness warnings. Image detection also sees logos and cannot prove or
  rule out scanned Transactions on mixed pages.
- `scripts/inspect-*-proof.mjs` are manual **desktop-only** diagnostics. They
  write private extraction evidence only to ignored `.expo/` output, report only
  metadata, and must never be cited as Android/WKWebView/device proof.

## Fixture and evidence matrix

| Case | Expected ledger / evidence | Current coverage |
| --- | --- | --- |
| Encrypted BDO, 6 pages | Every row/date/sign and controls vs original PDF | Desktop and Android extraction: 46 Transactions; legacy controls reconcile in stream order; human ledger review pending |
| Missing/wrong/correct password | Challenge, retry, success; no persisted secret | Desktop, Android engine and normal Android picker/password UI observed; iPhone pending |
| Fictional BDO plain/encrypted | Existing invented four-row ledger, 200001 cents | Reuse `web/e2e/fixtures/`; device review pending |
| BDO multipage/wrapped/duplicate rows | Independent sanitized ledger and repeated headers | Real input exists locally; row-by-row human review pending |
| EastWest Visa | Actual sanitized PDF bytes and independent ledger incl year boundary, payments/credits | Missing; text fixture alone is insufficient |
| GCash | Actual sanitized PDF bytes and ledger incl debit/credit columns, balances, references, wraps, cash-in/refund/outgoing | Missing; amount-magnitude reconciliation cannot establish direction |
| Corrupt/unsupported/scanned/mixed | Explicit rejection or completeness warning, no off-device fallback | Needs constructed/sanitized fixtures and device evidence |
| Cancel/retry/background/terminate | No stale result, responsiveness, cleanup and correct draft lifetime | Harness controls exist; device observations pending |
| Large/repeated/offline cold start | Wall time, native + WebView peak memory, zero extraction traffic, measured bounds | Pending both platforms |

Do not close the ticket, choose minimum OS/launch limits, or claim all providers
supported from the BDO desktop result. Android emulator is not low-memory physical
Android acceptance. Missing iPhone/fixture evidence stays explicitly unresolved.

## Sources

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
  [WebView](https://docs.expo.dev/versions/v58.0.0/sdk/webview/),
  [DocumentPicker](https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/),
  [FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/).
- [PDF.js binary input/lifecycle options](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
- Bundler retains PDF.js Apache-2.0 and CMap/font resource notices in generated HTML.

## Windows build note

The installed CMake/Ninja toolchain failed while creating long Worklets object
paths. A short `subst` workspace path alone did not fix it because autolinking
retained canonical paths. The proof's config plugin adds
`-DCMAKE_OBJECT_PATH_MAX=240` through normal Expo native generation, allowing
CMake to hash library object paths; application targets use 250 and a shorter
staging directory under the repository's ignored `.tmp/cxx/`. It changes
generated build configuration, not parser behavior. Do not edit generated
`android/` sources by hand.

## Repository verification

- Mobile lint and `tsc --noEmit` passed after adding the Expo linter. Two starter
  web-target issues were corrected inside `mobile-app/`: the TabTrigger ref type
  and the hydration hook's synchronous state update. No `web/` source changed.
- Required full root suite `node scripts/local-test-launcher.mjs --e2e` ran at
  `web/e2e-reports/full/37a3d1fa30fffb50/`: database rollback checks **3 passed**;
  browser cases **100 passed, 3 failed**. The failures were theme synchronization
  in Sharing at 1440px, spending journey at 390px, and import Review at 1440px.
  This is a failed completion gate, not passing acceptance. The map forbids
  edits to `web/`, so those failures are reported without modifying that app.
- iPhone EAS build request was rejected by automatic approval review pending
  explicit consent to upload the committed app source to Expo. No build was
  started by that rejected request. Private PDFs/passwords and ignored local
  extraction output are excluded from Git and the requested commit-based build.

## Android engine observation

Local emulator: Pixel 9 Pro, Android 16 / API 36, x86_64; Android System WebView
155.0.8059.43. The debug native app built and installed successfully. With the
WebView already loaded and CDP network emulation offline, PDF.js returned the
expected missing-password and wrong-password outcomes, then extracted six pages
and 46 Transactions from the supplied BDO input in **629 ms**. Stream-order
provider interpretation reconciled legacy controls. Observed resource request
schemes were `blob:` only during that diagnostic.

This used `scripts/inspect-android-proof.mjs` with a localhost ADB DevTools
forward, which injects the input through the debug bridge and reports metadata
only. It is actual Android WebView extraction, but does **not** prove the picker,
password-entry UI, temporary-file cleanup, airplane-mode cold start, native peak
memory, low-memory physical Android, or iPhone. The initial app process PSS sample
was about **586 MiB** in a debug client; it excludes an established renderer peak
and is not a production memory budget. Release profiling remains necessary.

The **normal Android UI path** was subsequently exercised: selected the local
PDF through DocumentPicker, observed the missing-password challenge and wrong
password retry, then entered the supplied password. With emulator airplane mode
enabled and Wi-Fi disabled **after the app had loaded**, extraction completed
in **760 ms**, yielding the same six pages / 46 Transactions and reconciled
legacy controls. A metadata-only DevTools observer watched the result; it did
not inject the bytes/password in this UI run. No request was observed during
the final unlock. The app-created `cache/DocumentPicker/` PDF existed while
waiting for a password and was gone after success; the source in Downloads was
unchanged. No claim of immediate secure memory erasure follows from clearing
the password field or releasing object references.

Force-stop/relaunch before the UI run returned to a fresh empty draft. The
initial normalized Exact rule probe displayed Food on Android. Full rule
ambiguity/manual-assignment coverage, cancellation mid-page, completed-draft
background retention, stale cache cleanup after termination, cold start in
airplane mode, and all iPhone evidence remain pending. Network settings used for
the emulator experiment are restored after testing.
