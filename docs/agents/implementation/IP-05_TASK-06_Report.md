# IP-05 Task 06: regression and native evidence

Evidence date: 2026-10-29, Asia/Manila. Base revision `f494e5f7d707ec19f37c5c8ff9b2cf8b468faf64`, with Tasks 01–05 already staged and Task 06 changes present during verification. Their staged changes were preserved. No dependency, native configuration, API or schema changes were needed.

## Automated evidence

Node 24.11.1 / npm 11.6.2, from `mobile-app/`:

| Command | Result |
| --- | --- |
| `npm test` | 183 passing, including the registered review suite |
| `npm run parser:test` | 17 passing |
| `npm run lint` | Passing |
| `npm run typecheck` | Passing |
| Isolated `review.test.ts` | 12 passing |

The additional mixed-ledger regression uses fictional evidence: PHP 1,000 purchase, PHP 300 outgoing transfer, PHP 5,000 payment, PHP 200 refund, cash-in and unknown direction. It keeps a duplicate-looking row under a distinct source identity, excludes/restores it independently, and checks corrections against unchanged original controls, reconciliation and warnings. The existing adapter/store spy verifies only two fixed-Space Category/Rule GETs through local staging, Continue and Back. This is automated no-write evidence; no native network trace was collected.

`npm test` now discovers the critical review regressions without a separate invocation. The feature README documents the exported `ReviewHandoff`, guarded store entry/exit and revision/serialization boundary. The local runbook now expects Update and Review ready instead of the retired unavailable-review message.

## Native Android evidence

ADB initially failed inside the filesystem sandbox but worked with approved execution outside it. Target `emulator-5554`: `sdk_gphone16k_x86_64` / `emu64xa16k`, Android 17, boot-completed `1`, 1080 × 2424 at density 420 (about 411 logical units wide), font scale 1.0, light appearance. Installed package `com.seyfsasy.spendeazymobile`, version 1.0.0 / versionCode 1, last update 2026-10-27 16:29:16. Existing development client and Metro were used; the binary's exact source revision/profile was not established. No rebuild was performed.

| Journey | Observed |
| --- | --- |
| Add → Import → native picker → existing fictional GCash PDF | Actual extraction handed off to Update with fixed Personal destination, advisory completeness warning, two Unmapped eligible outgoing rows and one cash-in exclusion; tabs/Add absent |
| Choose Food & Drink for purchase, open corrections | Category and amount remained tentative; ledger still showed Unmapped and PHP 1,000 while editor showed PHP 1,000.01 |
| Correction keyboard and Done | Amount input and Done remained accessible above keyboard at default size; Done retained pending edits |
| Remember → Save & next | Exactly/Contains and description-seeded pattern appeared; Save applied PHP 1,000.01 and Category, advanced to transfer, reset Remember off; final boundary reported one staged Rule |
| Skip transfer → Continue | Queue reported one skipped Transaction, not completion; Continue identified missing Category and offered Review Transaction 2 |
| Review skipped → choose Commute → Save | Zero Unmapped; ledger retained purchase PHP 1,000.01, transfer PHP 300 and excluded cash-in PHP 500 |
| Continue → Back to review | Read-only Review ready reported two included Transactions and one staged Rule, explicitly said nothing saved; Back restored completed queue and reviewed ledger |
| Home/background → launcher foreground | Completed review and corrected amount retained |
| Excluded filter → cash-in row | Only cash-in appeared; inspection showed original evidence, locked classification explanation and Return to queue, with no Restore control |
| Close | Keep editing/Discard confirmation appeared; discard was not completed in this walkthrough |

These observations establish the listed behaviors only. UI hierarchy inspection was the primary evidence; they do not establish full visual parity, accessibility focus or native network no-write certification.

## Remaining gates and development nuances

- Physical iPhone: no connected physical-iPhone test session was available; the entire matrix remains pending.
- Android: mapped-row correction after reopening, eligible Exclude/Restore, Contains propagation/conflicts, all-filter behavior with dirty buffers, catalog failure/retry, route Back/reopen, explicit discard, same-User auth recovery, sign-out/different identity, Space discard/restart/archive, deliberate force-stop/restart and longer-ledger acceptance remain pending. Automated coverage is separate.
- A combined system dark-mode/320-unit width/font-scale 1.3 attempt returned the development client to Dashboard and reproduced the multiple-linking/NavigationContainer warning already noted in IP-04. The transient screenshot preceded settled display changes and does **not** establish dark/narrow-layout acceptance or a confirmed cause for the reset. Original size, font scale and system light mode were restored. Repeat 320/360/390, both app Appearances, large text, safe areas, Android Back and screen-reader focus from a stable client; do not treat this development reset as a process-death test.
- The Add entry still labels Import statement “Not available yet” even though it opens selection/Update. This pre-existing copy was outside Task 06's test/documentation changes.
- Carry forward all IP-04/#151/#138 gaps: extraction completeness, real encrypted/mixed/partial engine input acceptance, memory/runtime, older-device floors, scoped cleanup/crash intervals and certified file/page limits. The 10 MiB/100-page guards remain development caps. Review tests do not certify parsing.
- #153 owns confirmation, serialization, freshness and persistence. Review ready is the tested local boundary; full Confirm/Back acceptance awaits that integration.

Local test logs and the transient fictional-screen capture remain ignored under `mobile-app/.expo/`; no PDFs, passwords, raw extracted text, private account identifiers or financial screenshots were added to Git.
