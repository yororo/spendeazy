# Acceptance optimization validation — issue #110

Recorded October 7, 2026. This is historical validation evidence, not current
architecture or a completed three-run performance benchmark.

The user explicitly authorized opening the PR after essential validation and
documenting the remaining benchmark protocol as incomplete. Two additional
baseline and two additional optimized full runs remain necessary for issue
#110's required three-run median comparison. No default worker increase follows
from these measurements; the default remains one.

## Observed runs

| Configuration | Browser tests passed | Browser seconds | Launcher wall seconds | Retries / skips / unexpected failures |
| --- | ---: | ---: | ---: | --- |
| Original suite, one worker | 111 | 1395.762 | 1426.232 | 0 / 0 / 0 |
| Optimized suite, one worker | 103 | 417.945 | 441.858 | 0 / 0 / 0 |
| Optimized suite, two workers | 103 | 236.111 | 253.628 | 0 / 0 / 0 |
| Optimized CI shard 1/2, one worker | 52 | 183.224 | 202.020 | 0 / 0 / 0 |
| Optimized CI shard 2/2, one worker | 51 | 273.493 | 292.113 | 0 / 0 / 0 |

Each launcher invocation also passed all three required PostgreSQL
rollback/duplicate tests. The unfiltered one-worker comparison is one matched
pair: 23.3 to 7.0 browser minutes, with an observed saving of 977.817 seconds.
These are individual runs. They do not establish the specified median,
repeated-run reliability, or a measured before/after CI shard improvement.
The current shard execution gap is 90.269 seconds and remains visible in reports.

The one-worker baseline's phases were startup 21.401s, API checks 5.082s,
browser subprocess 1397.892s, and teardown 1.858s. The optimized one-worker phases
were startup 18.103s, API checks 3.143s, browser subprocess 418.988s, and teardown
1.624s. Playwright suite duration excludes subprocess startup/exit overhead.

## Method and reproducibility

Both full comparison runs used the same Windows desktop, Node 24.11.1,
npm 11.6.2, Microsoft Edge 154.0.4258.53, UTC browser timezone, fixed clock
`2026-09-19T12:00:00.000Z`, line plus JSON reporters, and newly initialized
launcher-owned PostgreSQL databases. No builds or unit suites competed with
these comparison runs. CI shard checks were local reproductions with `CI=true`,
one worker, and their usual HTML/blob/JSON diagnostics; they are separate
validation observations.

The original `web/e2e/` tree was copied before edits from the checkout at
`445ee1edf1597538e41ae41c29d48996eceb5086`. A temporary Playwright configuration
selected that entire copied tree, and a temporary copy of the instrumented
launcher supplied that configuration. Application code, services, fixture PDFs,
dependencies, clock, and reporter settings stayed the same. This preserved the
original 111-test suite without restoring over working changes.

To reproduce the baseline, export `web/e2e/` from that commit into a temporary
directory under `web/`, select the exported whole tree in a temporary config
that imports the current Playwright config, and invoke it from an instrumented
launcher copy. Run the optimized tree through the ordinary unfiltered launcher.
Keep three complete run directories per configuration, then use:

```powershell
node scripts/e2e-timing-summary.mjs --compare <before-directory> <after-directory>
```

The comparison command rejects fewer than three runs, skipped/failed runs,
missing browser reports, unmatched clocks, inconsistent worker settings,
increased retries/flakes, and absence of lower median browser duration.

Raw reports remain locally under `web/e2e-reports/<shard>/<run-id>/`. Run IDs:

- Baseline: `69c02c0a2b8cd27b`
- Optimized one worker: `2b66f72ee9c778ab`
- Optimized two workers: `c5c16ce9f1afeb01`
- Final exact-diff two-worker recheck: `bf5fe533eacc3ae8` (103 passed, 3.9 minutes,
  zero retries/skips/unexpected failures, plus all three PostgreSQL checks)
- CI shards: `40ee61a7d10340f9` and `b183554fe7facbbe`

Development trials exposed background-tab throttling, asynchronous menu focus
restoration, a date-field fixture's dependency on another test, and the gap
between a User insert and completion of Personal Space/default provisioning.
Those issues were corrected with real tab activation, retrying focus/navigation
assertions, test-owned data, and authenticated browser PUT response waits.
Failed and changing-source development trials are excluded from the table and
retained locally as rejected prototype evidence.

## Cleanup and essential checks

An intentional throw after creating the Settings fixture ran twice (one retry)
in run `ae90ef202ac1708b`. Both attempts failed solely with the intended error;
fixture teardown and the after-all assertion verified that tabs/contexts closed.
Failure screenshots occupied separate attempt directories, and retry 1 retained
`trace.zip`. The launcher returned exit 1 and recorded the browser failure phase.
Docker queries confirmed that its container and volume were removed.

Web lint, production build, all 668 unit tests, strict type checking of every E2E
TypeScript file/config, timing-summary tests (3), release-planner tests (4), and
release-gate verification passed. The [coverage inventory](../../../specs/e2e-optimization-coverage.md)
maps every narrowed scenario to retained owners and required execution gates.
