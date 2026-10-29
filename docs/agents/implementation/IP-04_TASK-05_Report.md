# IP-04 Tasks 02–05 verification and remaining gates

Evidence date: 2026-10-29, Asia/Manila. Base revision `7be5d1fe34dc2d79c1766d8ab8e9bca68e78415a`, with these implementation changes dirty during testing. No dependencies/native configuration changed. Android used the existing installed development client with current Metro JavaScript; the native binary's exact source revision/build profile was not established, and no new native build was run. No API/schema changes were made.

## Automated evidence

From `mobile-app/`:

| Command | Observed |
| --- | --- |
| `npm run parser:test` | 17 passing: retained proof regressions, production HTML syntax/CSP, mocked engine password/page/error outcomes and actual native-adapter port tests |
| `npm test` | 160 passing, including production fictional ledgers/workflow and existing session/Space/manual Expense checks |
| `npm run typecheck` | Passing |
| `npm run lint` | Passing |

Engine/adapter mocks do not prove native worker memory, encrypted-PDF handling, OS file ownership or teardown. The generated `.expo/statement-import-fixtures/` inputs are fictional PDFs produced by `scripts/statement-import-native-fixtures.mjs`; no private documents or screenshots are staged.

## Native Android observations

Target: `emulator-5554`, `sdk_gphone16k_x86_64` / `emu64xa16k`, Android 17, 1080 × 2424, density 420 (approximately 411 logical units wide). Emulator boot completed; an installed development build and the existing Metro server were available. ADB required execution outside the initial filesystem sandbox to connect to its daemon.

| Steps and expected result | Observed |
| --- | --- |
| Open signed-in import route; fixed Space and real history state | Select PDF shown for Personal; real history empty state; tabs/Add absent |
| Pick fictional BDO Amex, then explicitly discard and select EastWest Visa, then GCash | Each reached Extraction ready: three Transactions, two eligible spending candidates; completeness warning and unavailable-review explanation shown |
| Inspect owned files after terminal success | Dedicated cache area absent; cleanup journal `[]`; original fictional PDFs still present in Downloads |
| Android Back, reopen via app route | GCash ready result retained |
| Home/background, foreground app | GCash ready result retained |
| Explicit discard then native picker cancellation | Acknowledgment displayed; cancelling the picker itself returned to Select PDF. Back from a picker subfolder first navigates up, so a second Back was needed to cancel |
| Restart during development, reconnect installed client to Metro | Startup returned to selection with an empty cleanup journal; this did not test recovery of a pending journal entry |
| Inspect light/dark | Semantic content/surface adaptation legible and wrapping at default width; original system light mode restored. Full visual acceptance remains pending |

The initial native run exposed asynchronous file-copy ordering and generated-bundle replacement errors; both were fixed and regression-covered before the provider successes above. Fast Refresh of workflow modules during an operation can retain incompatible development state; force-stop/reconnect was used for the final adapter validation. Do not interpret development-refresh behavior as process-retention acceptance.

## Pending acceptance / exact limits of this evidence

- Physical iPhone: no connected physical-iPhone testing session was available. Entire iPhone matrix remains pending.
- Android: actual missing/wrong/correct passwords; extraction cancellation at a page milestone and immediate retry; native corrupt/encrypted/image-only/mixed/partial PDFs; ambiguous identity and reconciliation mismatch; session expiry/same-User recovery, sign-out/different identity, Space discard/restart and archive transitions remain pending. Core rules for these are automated, not device acceptance.
- Process termination with journaled staging/owned files still present, worker termination inspection and the unavoidable OS picker crash interval need dedicated native evidence. Successful cleanup and empty-startup observations do not close #138.
- 320/360/390 widths, large text, safe areas/keyboard/password focus, screen-reader labels/focus and clean-build status-bar/navigation checks remain pending. The development client showed a multiple-navigation-container warning during the theme/deep-link walkthrough; it was not investigated as part of the parser increment.
- No peak-memory/runtime certification, older-device floors or supported file/page limits were measured. The 10 MiB/100-page guards remain development caps under #138.
- #152 review/Rules integration and #153 confirmation remain separate. No Expense/import write was exercised or enabled by this increment.
