# Coverage inventory for issue #110

Every retained browser owner below runs in the unfiltered isolated launcher and
its two required CI shards. No API or component assertion replaces a browser
assertion in this change; endpoint and mocked-history scenarios remain in place.

| Narrowed work | Behavior retained | Owner and seam | Required gate |
| --- | --- | --- | --- |
| Sharing journeys at 320, 767, 768, 1023 and 1024px | Real invitation, claim, acceptance, Shared selection, archive, notification, read-only history, Category Color, activity, denied write, focus and draft preservation | `sharing-themes.spec.ts` real browser/API/PostgreSQL journeys at 390/1440px; populated history containment at boundary widths within the mobile journey; `responsive-navigation.spec.ts` boundary navigation | Isolated launcher / CI e2e |
| Spending presentation journeys at those five widths | Reporting Period, money, Space, route, structural color, no financial writes, loading/error/retry, overflow | `spending-themes.spec.ts` at 390/1440px with populated surface checks at boundary widths; focused boundary navigation | Isolated launcher / CI e2e |
| Full Personal spending journey at 320px | Encrypted PDF worker, incorrect password/recovery, dirty Remember editor, bulk assignment, exclusion/re-inclusion, Review, persistence, statement filtering, Reporting Period restoration, monthly actions, chart and duplicate rejection | `spending-journey.spec.ts` at 390/1440px; password dialog checked at 320px within mobile journey; existing 320px Categorize layout and chart tests | Isolated launcher / CI e2e |
| Repeated System combinations on financial presentation surfaces | Exhaustive preference selection, System media changes and browser state preservation | `theme-settings.spec.ts` owns exhaustive live Settings matrix; public cold-load matrix remains distinct; each fragile financial state retains real cross-tab transitions; all four rendered Theme/light-dark combinations remain on unique financial surfaces | Isolated launcher / CI e2e |
| Unconditional successful screenshots | No screenshot comparison assertions are removed; rendering, contrast, focus and overflow assertions remain | Captures opt in via `SPENDEAZY_E2E_SCREENSHOTS=1`, use test/shard output paths; failure screenshots and first-retry traces remain | Playwright config / CI diagnostics |
| Settings Dashboard loads on each change | Accessible Settings selection, real storage events, font readiness, active workflow identity/focus/scroll/content and absence of writes | Test-scoped preferences fixture, `theme-helpers.ts`, existing dirty-editor/import/sharing tests; fixture integration checks | Isolated launcher / CI e2e |
| Sequential 101-row setup | Both 100-record summary-fetch and 20-record display boundaries, 101/102 totals and load-more behavior | `transaction-filter-summary.spec.ts`, bounded setup requests for its fresh User | Isolated launcher / CI e2e |

No assertion is retired from ownership, rollback, session recovery, mocked
history, or clean-install provisioning. Concurrency remains one worker by default.
The unfiltered completion gate remains mandatory.

## Shared-resource audit

Financial fixture writers use fresh server-issued identities, including the
ownership matrix, revocation and full Shared financial journey. These scenarios
explicitly provision their Users and no longer require the broad serial group.
The full Shared journey uses client navigation and the real Space selector so
full-page loads cannot reset its fresh synthetic identity.

One named-User financial writer remains: `local-test.spec.ts`'s stale-cache
switch check owns and deletes its Transaction in `finally`. Its assertions select
its own row rather than depend on totals or empty data. The chart-layout writer
now also uses a fresh User and client navigation. The mobile date-field scenario
creates its own Transaction for a fresh
User, rather than relying on the stale-cache fixture remaining in the database.
Named-User Space checks explicitly provision the second
User and assert access rather than assume an empty Space list. Settings tabs,
public-page provisioning, fixed-User Category/default checks and cold-load tests
are readers (apart from idempotent real provisioning). Session expiration/recovery
creates separate server-issued credentials; revocation now uses a fresh User.

`SPENDEAZY_E2E_WORKERS=2` is the bounded opt-in concurrency configuration; the
default remains 1. Each shard has independent services, database and credentials,
and diagnostic output remains scoped to test, shard and unique launcher run.
