# Historical parser research

For current local startup use [the local runbook](../local-testing.md). Commands and environment observations below describe the dated experiment, not another supported setup.

# On-device statement PDF extraction

Research for [Identify viable on-device PDF extraction for the supported statements](https://github.com/yororo/spendeazy/issues/126), inspected 2026-10-22. Evidence report only: no extractor selected, installed or tested on devices.

This report predates [ticket #141](https://github.com/yororo/spendeazy/issues/141). Its browser source paths are historical; the current selected prototype and remaining evidence gates are in [the parser proof](../../mobile-app/src/prototypes/parser-proof/README.md) and [issue #138](https://github.com/yororo/spendeazy/issues/138).

## Recommendation and limits

Prototype two candidates: **bundled PDF.js in a restricted local WebView**, and **a local Expo module wrapping platform PDF APIs**. Start with the bundled engine because one extraction implementation may reduce cross-platform layout differences; this is an inference, not a measured result. The native option has an important constraint: Android page text extraction and password-capable loading require API 35. The product must explicitly decide whether that Android floor is acceptable; otherwise another embedded engine or a verified backport is needed. Do not raise the minimum OS silently.

Only BDO Amex, EastWest Visa and GCash E-Wallet PDFs are in scope. No PayPal, CSV, remote extraction or remote suggestions. The next prototype must prove complete Transaction extraction and reconciliation using actual PDF bytes, not only extracted-text fixtures. Confirmed eligible activity becomes Expense under the new domain contract.

## Existing code: reuse candidates, not portability proof

Inspected repository revision [67de6bb](https://github.com/yororo/spendeazy/tree/67de6bb); references below are pinned to that historical source state.

- Historical [pdf-extractor.ts](https://github.com/yororo/spendeazy/blob/67de6bb/web/src/features/statement-import/statement-parser/pdf-extractor.ts) depended on browser File, Vite base URLs and PDFParse worker assets. It used stopAtErrors, per-page text, password errors and final cleanup. Installing pdf-parse under Hermes was not evidence it worked there.
- Historical [transformer.ts](https://github.com/yororo/spendeazy/blob/67de6bb/web/src/features/statement-import/statement-parser/transformer.ts) dispatched the three provider transformations. Suitable pure transformation, reconciliation, money/date and matching logic has since moved to mobile ownership.
- Historical [GCash parsing](https://github.com/yororo/spendeazy/blob/67de6bb/web/src/features/statement-import/statement-parser/gcash-ewallet-transformer.ts) depended on line-based table headers and column patterns. A new engine's text order and line breaks were a conformance gate.
- Historical [statement-categorizer.ts](https://github.com/yororo/spendeazy/blob/67de6bb/web/src/features/statement-import/statement-categorizer.ts) logged full extracted text and changed amount signs. Do not transplant that logging; reassess payment/credit and sign rules under the new domain contract.
- Historical [provider text fixtures](https://github.com/yororo/spendeazy/tree/67de6bb/web/docs/pdf-parser/) and [fictional PDFs](https://github.com/yororo/spendeazy/tree/67de6bb/web/e2e/fixtures/) are useful evidence inputs, not full provider PDF coverage.

## Candidate evidence

| Candidate | Official evidence | Tradeoff still requiring proof |
| --- | --- | --- |
| Local Expo module: Swift PDFKit / Kotlin PdfRenderer | Expo recommends local modules for app-specific native code. Apple supplies page string and password unlock; Android supplies ordered page text from API 35. [Expo](https://docs.expo.dev/workflow/customizing/), [Apple string](https://developer.apple.com/documentation/pdfkit/pdfpage/string), [Apple unlock](https://developer.apple.com/documentation/pdfkit/pdfdocument/unlock(withpassword:)), [Android text](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer.Page#getTextContents()) | Two engines can reconstruct tables differently. Apple APIs cited are available from iOS 11, but the selected Expo stack determines the actual iOS floor. Android API 35 floor must be explicit. No separately bundled engine license is introduced by calling system APIs; platform SDK terms apply. |
| Bundled PDF.js in local react-native-webview | Binary input, text items, password callbacks, loading destruction are documented. Expo has SDK 58 WebView documentation. [input](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [page API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html), [lifecycle](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html), [Expo](https://docs.expo.dev/versions/v58.0.0/sdk/webview/) | Shared engine, separate browser runtime from React Native UI. Bundle engine, matching worker and required fonts/CMaps/support assets. Prove local worker and resource loading on WKWebView and Android WebView; browser support is not Hermes certification. |
| Local Expo module with bundled PDFium | C API provides text characters, geometry and explicit text-page cleanup. [source](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/fpdf_text.h) | Alternative if native API floor or WebView fails. App owns native builds, ABIs, size and security updates. A rendering wrapper does not necessarily expose text extraction. No wrapper is selected here. |

PDF.js uses Apache-2.0; PDFium has BSD-style conditions and additional notices. Audit the exact distribution and bundled dependencies, retain notices and pin versions. OS engine maintenance follows OS releases; bundled engines need app-managed updates. No support SLA or device compatibility follows from repository activity. PDF.js specifically documents engine/worker version mismatch failures. [PDF.js license](https://github.com/mozilla/pdf.js/blob/master/LICENSE), [PDFium license](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE), [PDF.js FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)

## Proposed extraction contract and safeguards

These are prototype requirements, not implemented guarantees:

1. Local URI plus ephemeral password in; page-indexed text and optionally positioned runs out. Keep extraction separate from provider interpretation. Distinguish password challenge, corrupt/unreadable, no-text, unsupported, resource-limit and cancellation outcomes. Preserve page boundaries for reconciliation and diagnostics without logging user content.
2. Native loading/extraction runs on a worker queue. Android documents long-running loading and API 35 LoadParams password handling. Close pages before the document. Check cancellation between pages and reject stale operation identities; do not promise interruption of synchronous OS calls merely because a method returns a promise. [PdfRenderer](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer)
3. PDF.js exposes missing/wrong-password callbacks and loading-task destruction. Measure cancellation and cleanup. Process pages sequentially without rendering raster previews for extraction. Typed-array transfer can reduce worker memory, but React Native/WebView base64 messages can create extra copies. Measure peak memory rather than assuming streaming. [lifecycle](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html), [input](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
4. DocumentPicker can copy to cache for immediate FileSystem access. Use an app-owned temporary import location; delete copies on finish, abandonment and sign-out, clean stale copies after restart, and never delete the user's original. Cloud document providers may need to download their files first: parsing is offline once bytes are local. [DocumentPicker SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/document-picker/), [FileSystem SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/)
5. WebView loads only bundled trusted extractor code. Restrict navigation and file access, avoid document scripting and remote asset paths, and use typed data messages rather than interpolating sensitive data into executable JavaScript. iOS file read scope is controlled by allowingReadAccessToURL. Navigation blocking alone does not prove zero subresource requests; test actual traffic. [WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md)
6. No raw PDFs/passwords/text in API payloads, analytics or crash breadcrumbs. Only confirmed payloads sync online. Never persist passwords. Garbage collection does not guarantee immediate secure erasure; minimize lifetime/copies instead of promising it.
7. Extraction is not OCR. Reject image-only PDFs clearly initially. Mixed text/image pages can omit activity even when some text exists: require complete provider controls and reconciliation. Local OCR would need a separate accuracy decision, with no remote fallback.

## Required prototype evidence and unresolved decisions

[Prove the selected parser path on Android and a physical iPhone](https://github.com/yororo/spendeazy/issues/130) remains open. It must resolve:

- Android minimum OS versus API 35 platform extraction; selected Expo SDK/React Native version and architecture compatibility; whether PDFKit plus Android platform API or a common bundled engine is acceptable. SDK 58 docs were read because the starter declares Expo ~58.0.16, not as proof it is the final stable stack.
- Exact versions, Android emulator API/WebView, physical iPhone model/iOS and development build profile. Custom native modules need a development build; Expo Go cannot prove them. [Expo native workflow](https://docs.expo.dev/workflow/customizing/)
- Full PDF matrix for all three providers: multipage/repeated headers, wrapped descriptions, duplicate-looking rows, references, dates, debit/credit signs, control totals; plain/encrypted, no/wrong/correct password; corrupt, unsupported, scanned and mixed pages. Compare every Transaction to a hand-checked ledger and reconcile integer cents. Never accept silent partial success.
- Before/after text and geometry evidence on both platforms, including provider-specific normalization needed to preserve rows and columns.
- Airplane-mode cold start with bundled assets and locally available PDFs; observable zero parsing/suggestion requests. Saving remains an independent online action.
- Cancel/retry, navigation away, Space change, background/foreground, termination/relaunch, temporary file cleanup and repeated imports without stale results.
- Measured wall time, UI responsiveness, peak memory and repeated-run retention. Derive file/page limits from measurement. Android emulator testing does not substitute for low-memory physical Android release validation.

## Validation status

At report time, no runtime implementation, dependency installation, native compilation or hardware parsing test occurred. The then-required root browser launcher stopped before tests because the Docker Desktop Linux engine pipe was unavailable. That historical result was blocked, not passed; the command is retired. This research does not establish native certification or close the parser gates.
