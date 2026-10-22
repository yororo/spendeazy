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
| Encrypted BDO, 6 pages | Every row/date/sign and controls vs original PDF | Desktop extraction: 46 Transactions; legacy controls reconcile in stream order; human ledger review pending |
| Missing/wrong/correct password | Challenge, retry, success; no persisted secret | Desktop observed; Android/iPhone pending |
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
