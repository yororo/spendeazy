# On-device statement parser: proposed decision

Status: prepared for final User review. This document does not certify launch
limits or close [Validate the on-device parser approach on Android and iPhone](https://github.com/yororo/spendeazy/issues/130).
The prototype stays on its throwaway branch and out of production.

## Recommendation

Use bundled PDF.js in a restricted local WebView, with **engine stream order**
and sequential page extraction. Keep extraction, provider interpretation,
reconciliation and Category Rule matching as separate modules. The tested
baseline is PDF.js 5.4.296 with its matching worker and bundled resources.
Retain license notices and validate the fixture matrix when updating it.

The Android and iPhone trials support choosing this approach for the mobile
specification. Spatial sorting is not a substitute for provider-aware text
reconstruction: it merges columns and fails the real BDO/EastWest controls.
The EastWest proof needed whitespace normalization in control labels, while
retaining complete amount parsing and reconciliation.

## Evidence and its scope

| Observation | Result |
| --- | --- |
| Android 16/API 36 emulator, WebView 155; BDO normal picker/password UI | Six pages / 46 Transactions, legacy controls reconcile, 760 ms; airplane mode with Wi-Fi off after app load; picker-created copy removed after success |
| Bundled Android release variant, same emulator | Offline before cold launch, no Metro; six pages / 46 Transactions reconcile, 1,007 ms. Background retains result; force-stop clears draft. Cancel during active fictional extraction and immediate BDO retry succeed (1,212 ms); no page-progress milestone was captured before the native cancel |
| Physical iPhone 14 Pro Max, iOS 27.0.1; BDO | User confirms offline cold start and matching rows/totals; private screenshots show six pages / 46 Transactions, 333 ms, reconciled controls |
| Physical iPhone; EastWest | Initial missing-control failure reproduced and corrected; User confirms successful corrected-build retest. Separate supplied five-page sample reconciles 16 Transactions on desktop |
| Physical iPhone; GCash | User confirms no issues in response to row/date/amount/total/direction review. Coverage of absent activity types is not inferred; the original remains private |
| Physical iPhone password/lifecycle | User confirms wrong-password/correct retry, cancel at password prompt/reselect, background/reopen after success, and force-close/reopen clears draft |
| Local Category Rules | Exact precedence, case/whitespace normalization, Contains within words, punctuation, conflicting Categories and inactive/empty patterns pass fictional checks |
| Exact embedded worker in desktop Edge, offline before load | Corrupt input returns unreadable; image-only/mixed flags preserve completeness concerns; 101 pages hits guard; 100 simple fictional pages succeeds; ten repeated extractions retain operation identity; page destruction during extraction followed by fresh-worker retry succeeds. Only blob requests observed |

Desktop observations do not become device evidence. User reports are attributed
as such; no private statements, passwords, screenshots, financial values or raw
text are published. Detailed reproduction and checks live in the
[prototype README](../../src/prototypes/parser-proof/README.md).

Release emulator memory observations: app PSS 190,119 KiB at ready and 211,914
KiB after BDO; its associated WebView renderer was 104,044 KiB after extraction.
A sample around synthetic cancellation was 254,291 KiB for the app; during the
following retry, app 225,189 KiB / renderer 120,893 KiB. These snapshots are not
continuous peak sampling or a long-run retention study. Cold activity start
reported 4,503 ms initially and 2,238 ms on the subsequent force-stop launch;
these timings exclude a separately bounded worker-ready measurement.

## Module contracts for implementation

1. **Local extraction:** accept an app-owned local URI, optional ephemeral
   password, operation identity, cancellation and configured resource guards.
   Return page-indexed text/runs and image/no-text evidence. Do not infer a
   successful import from text availability. Preserve the page boundaries.
2. **Provider interpretation:** use pure BDO, EastWest and GCash modules over
   extracted content. Return Transactions and original provider controls,
   preserving dates, signed direction, references and duplicate-looking rows.
   Work in integer cents. GCash direction must use statement evidence; the
   prototype's description heuristic is not the target contract.
3. **Reconciliation/review:** preserve original controls and report mismatches as
   advisory warnings. Keep edited/excluded review totals separate from original
   evidence. Apply the agreed incoming/outgoing Expense semantics; never turn
   incoming activity into an Expense merely to make totals reconcile.
4. **Category Rules:** match active rules locally with normalized case/whitespace;
   Exact overrides Contains; conflicting Categories remain Unmapped. No remote
   suggestions. Persisted rule/manual-assignment flows belong to implementation.

## Failure and privacy behavior

- Missing or wrong password: local challenge/retry, with cancel/choose another
  file. Never persist or log passwords.
- Corrupt, unreadable, unsupported encryption/provider or guard exceeded:
  explicit explanation and Retry / Choose another file. No server/cloud fallback.
- Image-only statement: explain that text extraction cannot read scans and
  request a text-based statement. No OCR in the selected baseline.
- Mixed images/text: preserve completeness warnings. Images may be logos; image
  presence alone neither proves nor rules out missing scanned Transactions.
  A partial result must never be presented as verified complete.
- Cancel: destroy the worker, invalidate the operation and ignore late results.
  Backgrounding may retain an in-memory draft while the process lives;
  termination discards it. Do not promise recovery of a terminated draft.
- Copy only to an app-owned import location; delete that copy on success,
  abandonment and sign-out; remove stale copies at startup after termination.
  Preserve the User's original. Startup stale-copy cleanup is not implemented
  by this throwaway proof and remains a required implementation gate.
- Bundle all parser assets, restrict WebView navigation/network/file access,
  disable PDF document scripting and send typed data messages. No PDF/password/
  raw text goes to APIs, analytics or crash breadcrumbs. Resource restrictions
  and absence of observed requests are not a universal packet-capture guarantee.

## Limits and remaining launch gates

The proof's **10 MiB / 100-page** guards are provisional investigation limits.
The synthetic 100/101-page checks establish guard behavior, not a production
memory budget. A small successful statement does not establish a safe maximum.

Keep the SDK's platform compatibility distinct from tested-device support.
The emulator and physical iPhone above are the observed configurations; do not
silently impose Android API 35 just because the alternative platform text API
needs it. Older WebViews/iOS and low-memory physical Android require release
verification before choosing the product's minimum supported configurations.

Before mobile launch, record a measured file/page/time/memory envelope with
representative large statements, repeated runs, app and renderer processes,
supported OS/WebView floors and a low-memory physical Android. Also verify
termination-time/stale-copy cleanup, native mid-page cancel/retry and complete
provider direction/error fixtures. Any gaps remaining when the engine decision
closes must be explicitly tracked as a blocking launch-validation follow-up.

Proposed closure scope: select PDF.js plus engine stream and the contracts/UX
above from the observed proof; keep unmeasured release limits and cleanup as
explicit launch gates. This is a specification decision, not permission to merge
the prototype or ship an unvalidated production import feature.
