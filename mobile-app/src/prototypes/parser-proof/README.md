# Throwaway on-device PDF.js proof

Question: can a bundled PDF.js engine preserve the supported statement semantics
on Android and physical iPhone? This branch is an experiment to review, not the
production import feature or an approved parser choice.

For [Validate the on-device parser approach on Android and iPhone](https://github.com/yororo/spendeazy/issues/130).
User selected PDF.js and supplied one local encrypted BDO Amex PDF. Do not merge
this experiment into the production app. Keep the ticket open until the remaining
device/fixture evidence and human review exist.

## Run

Run `npm run parser:test` from `mobile-app/` for the fictional EastWest ledger
regressions. It prepares the bundled diagnostics and checks PDF-run whitespace,
dates/signs, missing/malformed controls and strict legacy reconciliation.

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
- `providers/`: snapshots of the pure web transformers at `69055e9`, with local
  money/description helpers and import paths. The EastWest proof adds control
  label whitespace normalization for PDF text runs. `web/` is unchanged.
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
| Encrypted BDO, 6 pages | Every row/date/sign and controls vs original PDF | Desktop, Android and physical iPhone: 46 Transactions; legacy controls reconcile in stream order; User confirms matching rows/totals on iPhone |
| Missing/wrong/correct password | Challenge, retry, success; no persisted secret | Desktop and Android engine/UI observed; User confirms iPhone wrong-password retry succeeds. Independent iPhone persistence inspection remains pending |
| Fictional BDO plain/encrypted | Existing invented four-row ledger, 200001 cents | Reuse `web/e2e/fixtures/`; device review pending |
| BDO multipage/wrapped/duplicate rows | Independent sanitized ledger and repeated headers | User confirms matching rows/totals for supplied six-page BDO on iPhone; independent reusable sanitized ledger still absent |
| EastWest Visa | Actual sanitized PDF bytes and independent ledger incl year boundary, payments/credits | Original iPhone: missing purchases control. Separate five-page sample reproduces same error; whitespace fix reconciles 16 Transactions on desktop. User reports successful corrected iPhone retest; separate counts/timing and independent expected ledger not supplied |
| GCash | Actual sanitized PDF bytes and ledger incl debit/credit columns, balances, references, wraps, cash-in/refund/outgoing | User reports iPhone pass; counts/timing, direction-specific review and independent ledger not separately supplied |
| Corrupt/unsupported/scanned/mixed | Explicit rejection or completeness warning, no off-device fallback | Needs constructed/sanitized fixtures and device evidence |
| Cancel/retry/background/terminate | No stale result, responsiveness, cleanup and correct draft lifetime | User confirms iPhone cancel at password prompt/reselect, background/reopen after success, and force-close/reopen clears draft. Mid-page cancellation and termination-time filesystem cleanup remain pending |
| Large/repeated/offline cold start | Wall time, native + WebView peak memory, zero extraction traffic, measured bounds | iPhone BDO: 333 ms, User confirms offline cold start with Wi-Fi off; network capture, memory/limits and Android cold start pending |

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

- Latest full root suite after the EastWest fix:
  `node scripts/local-test-launcher.mjs --e2e`, report
  `web/e2e-reports/full/8b0b0a90ebfbedba/`: database rollback checks **3 passed**;
  browser cases **103 passed** (8.0 minutes). The earlier theme failures below
  did not recur. The suite cleaned its dedicated database/container afterward.
- Mobile lint and `tsc --noEmit` passed after adding the Expo linter. Two starter
  web-target issues were corrected inside `mobile-app/`: the TabTrigger ref type
  and the hydration hook's synchronous state update. No `web/` source changed.
- Earlier full root suite `node scripts/local-test-launcher.mjs --e2e` ran at
  `web/e2e-reports/full/37a3d1fa30fffb50/`: database rollback checks **3 passed**;
  browser cases **100 passed, 3 failed**. The failures were theme synchronization
  in Sharing at 1440px, spending journey at 390px, and import Review at 1440px.
  That run failed; the passing rerun above supersedes its completion-gate result.
  No `web/` changes were made to address those intermittent failures.
- The initial iPhone EAS request was rejected pending explicit source-upload
  approval; the User subsequently approved it. The approved build and its exact
  source are recorded below. Private PDFs/passwords and ignored local extraction
  output are excluded from Git and the uploaded source snapshot.

## iPhone preview preparation

The replacement [internal iPhone preview](https://expo.dev/accounts/seyfsasy/projects/spendeazy-mobile/builds/b33a96c2-1c8f-4428-bf4f-a62ddbf1fae8)
finished successfully on 2026-10-22. Its uploaded source is
[commit 132bbc9](https://github.com/yororo/spendeazy/commit/132bbc9fc8161394b98e3a4c2ad05ce47575c464),
verified against the controlled export. This is a signed, bundled `preview`
build with internal distribution; build success is not an extraction result.
The User reported **successful device testing** on **iPhone 14 Pro Max,
iOS 27.0.1** after receiving this preview and the BDO test instructions.
The User subsequently confirmed offline cold start in airplane mode with Wi-Fi
disabled, six pages / 46 Transactions, and matching rows/totals. Two privately
attached screenshots corroborate **333 ms**, PDF.js **5.4.296**, engine stream
order, six pages, zero empty-text pages, eight image operations, 46 Transactions
and reconciled legacy BDO controls. The completed result remains visible with
multiple active/inactive/background transitions in the lifecycle trace; this
supports retention for that observed session, not process-death recovery.
The screenshots were captured with connectivity icons visible: offline execution
is established by User confirmation, not the screenshot or network capture.
App-reported OS is 27.0.1; the WebView compatibility user-agent reports an iOS
18_7 token, which is not treated as an independent OS-version measurement.
Private screenshots and financial values are not copied into Git or issues.
Later User-reported password/lifecycle checks are recorded below. Native peak
memory and stale-copy cleanup on iPhone remain unconfirmed. Image operations may include logos; this result does
not establish support for scanned/mixed statements or every provider.
Open the build page on the registered iPhone
to install, download the PDF in Files, then fully close the app, enable airplane
mode with Wi-Fi disabled and reopen **Parser proof**. With engine stream order,
the comparison target from Android is six pages and 46 Transactions, followed
by independent row/control review. Report only sanitized counts, timing and
behavior; keep the statement/password and financial values local.

User-approved internal preview: [EAS build](https://expo.dev/accounts/seyfsasy/projects/spendeazy-mobile/builds/2cfc045b-aa7d-4dcb-aa58-2e04706da10b),
requested 2026-10-22. Source: [commit 1b05534](https://github.com/yororo/spendeazy/commit/1b05534f5fd651f541f77a308d9ac4cada6f9cd3).
This first attempt failed before compilation: EAS npm 10.9.9 required optional
`@emnapi/core` / `@emnapi/runtime` peer entries omitted by the npm 11 lockfile.
The same failure reproduced with npm 10 on both Windows and macOS/ARM64 install
selection, isolating installer-version behavior rather than a PDF engine or
upload mismatch. Regenerating those entries with npm 10.9.9 made the exact
`npm ci --include=dev --ignore-scripts --os=darwin --cpu=arm64 --dry-run`
preflight pass; npm 11 validation also passes. No parser/runtime version changed.
The connector could not trigger it because this EAS project has no GitHub
repository connection. EAS CLI uploaded a controlled export with its project
root fixed to the snapshot; its 219 tracked files were verified against the
commit, accounting for Windows line endings. Thus EAS's Git commit field is
empty; this source pointer and the build message retain the provenance.

The snapshot passed `npm ci`, asset generation, lint and TypeScript without an
existing `expo-env.d.ts`. The repaired lockfile includes the linter dependency
tree; the parser/runtime versions in the matrix are unchanged. A tracked Expo
type reference makes fresh-checkout typechecks independent of Metro-generated
declarations. Existing remote signing/provisioning were reused; no store
submission or credential provisioning was requested. Build completion and
physical-iPhone extraction/review remain separate evidence gates.

## Further iPhone provider results

The User reports **GCash passed; EastWest failed** on the same iPhone proof.
The private EastWest screenshot shows local PDF.js extraction completed in
**230 ms**: six pages, zero empty-text pages and 24 image operations. Engine
stream order is selected. Provider interpretation then reports
`EastWest Visa statement validation failed: missing Plus: Purchases/Debits control.`
This distinguishes successful engine text extraction from failed provider
interpretation; it does not establish whether the cause is text reconstruction,
an unsupported statement layout, or a legacy control-matching assumption.
The UI reports temporary-copy deletion, but no independent iPhone filesystem
inspection was performed.
GCash is recorded as User-reported success; no counts, timing, separate
incoming/outgoing checks or reusable expected ledger were supplied. Private
screenshots and statement data are not committed or uploaded to the tracker.

### EastWest control-whitespace reproduction and correction

The User subsequently supplied an encrypted **five-page** EastWest sample;
it is distinct from the six-page iPhone input. It reproduces the exact
missing-purchases-control error in both stream and spatial desktop reconstruction.
A four-line minimized diagnostic isolates `Plus:   Purchases/Debits`: PDF text
runs preserve multiple spaces, while the legacy control lookup requires exactly
one. A fictional full-ledger regression failed with the same error before the
fix; it contains no statement data.

The proof's EastWest control lookup now collapses whitespace before matching
the label and slicing its amount. Labels, amount parsing and all legacy
reconciliation remain strict. Seven fictional regressions pass, including dates,
signs, tabs/nonbreaking spaces, genuinely missing or malformed controls, and
mismatched totals. No web source or dependency version changed.

The original sample now yields **16 Transactions** with reconciled controls in
engine stream order. The bundled PDF.js browser diagnostic on desktop Edge
also yields five pages / 468 runs / 16 Transactions in **246 ms**, with only
`blob:` requests observed. These are desktop observations, not a new iPhone
result. Spatial regrouping still fails control lookup because columns merge;
keep stream order selected. The previous BDO sample still yields six pages /
46 Transactions with reconciled controls. Mobile lint and TypeScript pass.
The [corrected internal iPhone preview](https://expo.dev/accounts/seyfsasy/projects/spendeazy-mobile/builds/bb7a5792-e527-4ea8-b322-a114414c3053)
finished successfully (2026-10-22 UTC / 2026-10-23 Asia/Manila), from
[source 3e4acef](https://github.com/yororo/spendeazy/commit/3e4acef7aa3bfa9bd0ec4edcca28e383e172707b).
All 220 files in its committed-only export were verified byte-for-byte against
that commit; private PDFs/passwords/evidence and uncommitted design edits were
excluded. Existing signing/provisioning were reused, with no store submission.
The User reports **successful retest** after receiving this corrected iPhone
preview. This confirms human-reported resolution of the EastWest trial failure
on the previously identified iPhone 14 Pro Max / iOS 27.0.1. No new screenshot,
device counts/timing or independent expected ledger was supplied with the retest
report; the desktop measurements above are not relabeled as iPhone measurements.
The supplied
five-page sample's desktop comparison target is 16 Transactions with reconciled
controls; the earlier six-page statement is a separate input and needs its own
review. BDO, GCash and corrected EastWest now each have User-reported iPhone
success; this does not complete direction/error/lifecycle/memory coverage or
select the production engine.

### Further User-confirmed iPhone checks

The User confirms success for the requested wrong-password/correct retry,
cancel at the password prompt followed by choosing again, background/reopen
after successful extraction, and force-close/reopen with an empty draft.
These are human-reported functional outcomes; no mid-page cancellation,
independent filesystem cleanup or native memory measurements are inferred.
The private GCash PDF is optional for human device evidence: a report of
independently checked rows/totals and incoming/outgoing direction can be recorded
without sharing the original. Actual bytes would be needed to reproduce a
reported discrepancy. GCash direction-specific confirmation remains pending.

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
background retention on Android, stale cache cleanup after termination, Android
cold start in airplane mode, and the remaining iPhone acceptance evidence
described above remain pending. Network settings used for
the emulator experiment are restored after testing.
