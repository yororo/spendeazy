# Mobile-first spending monitoring and Statement Import UX

Status at export: agreed design and testing boundaries; published as [specification issue #75](https://github.com/yororo/spendeazy/issues/75). Current implementation status belongs to GitHub Issues.

This file preserves the published design; read GitHub issue #75 and its implementation tickets for current requirements and status. [The original review and interview](../archive/README.md) are archived design provenance. Publication details are recorded below.

## Problem Statement

Users need to understand their monthly spending, identify Categories that need attention, and act without losing context. Today an aggregate Budget percentage can look reassuring while an individual Category is Over Budget. Monthly Insights prioritizes historical totals over the selected month's risks, provides limited actionable explanations, and makes comparisons cumbersome on phones.

Statement Import adds friction through repetitive Category assignments, confusing expense/credit language, inconsistent Space labels, and lost review orientation. After confirmation, View Transactions can open an unrelated calendar month instead of the expenses just imported. Filtered lists also show totals whose scope is unclear. These discontinuities make it difficult to trust the data and decide what to do next.

## Solution

Provide one consistent mobile-first journey in the selected Space: open Dashboard, understand the selected month's spending and Category risks, import a Supported Statement, efficiently categorize and correct its expenses, check a read-only Review, confirm, and immediately browse the saved Transactions across all statement months. Monthly Insights leads with actionable Category status and explains potential patterns using recorded spending evidence.

Keep four mobile tabs: Dashboard, Imports, Transactions, and Insights. Expose Budgets through the existing navigation menu and contextual actions, retaining Category management within that destination. Preserve the Reporting Period, Category filters, and return context across actions. Desktop uses the same language, calculations, and behavior with layouts appropriate to its available space.

## User Stories

1. As a User, I want the selected Personal Space clearly identified, so that I know whose spending I am viewing.
2. As a User, I want the import destination visible throughout Statement Import, so that I trust where my expenses will be saved.
3. As a mobile User, I want the four primary tabs consistently available, so that I can move through the spending journey easily.
4. As a User, I want a clearly named Budgets destination containing Category management, so that I can find and maintain my spending limits.
5. As a User, I want Dashboard to show the selected month's recorded spending, so that I can get a quick overview.
6. As a User, I want Budgeted Spending and Unbudgeted Spending separated, so that a low aggregate usage figure does not hide expenses outside monthly Budgets.
7. As a User, I want individual Category breaches visible even when aggregate usage is low, so that I notice the limits that need attention.
8. As a User, I want consistent Within Budget, Nearing Budget, At Budget Limit, and Over Budget states, so that different pages do not contradict one another.
9. As a User, I want precise amounts alongside rounded percentages, so that I understand a status close to a threshold.
10. As a User, I want to import an encrypted Supported Statement through the existing password flow, so that I can record my expenses securely.
11. As a mobile User, I want a compact Category assignment interaction separate from full corrections, so that routine categorization needs fewer steps.
12. As a User, I want full description, date, amount, and Category corrections to remain available in Categorize, so that I can fix extraction inaccuracies.
13. As a User, I want to assign one Category to repeated descriptions within the current statement, so that I do not repeat the same task unnecessarily.
14. As a User, I want bulk candidates previewed with deselection, so that I control exactly which rows change.
15. As a User, I want bulk assignment to preserve existing assignments unless I explicitly select their replacement, so that reviewed work is not overwritten.
16. As a User, I want Apply & next to move to the next included Unmapped Transaction, so that I can finish categorization efficiently.
17. As a User, I want a prominent explanation of Remember's future benefit, so that I am encouraged to save useful Category Rules.
18. As a User, I want Remember to remain optional and unchecked, so that a temporary assignment does not silently become a persistent Rule.
19. As a User, I want Remember to default to Exact with an explicit Contains option, so that I control the breadth of future matches.
20. As a User, I want a preview of matches and future effects before remembering, so that I understand what the Rule will do.
21. As a User, I want equivalent Rules reused without redundant prompts or duplicates, so that the workflow stays clear.
22. As a User, I want conflicting Rules identified without silent replacement, so that an existing categorization decision is protected.
23. As a User, I want failed Remember saves to retain my inputs and offer recovery, so that I can retry or assign without remembering.
24. As a User, I want confirmation when a Rule is saved immediately, so that I know it is already available for future imports.
25. As a User, I want leaving an import to explain that saved Rules survive, so that discarding a draft does not mislead me.
26. As a User, I want to exclude an expense and re-include it in Categorize, so that I control which eligible expenses will be committed.
27. As a User, I want expenses, payments, and other credits described accurately, so that accounting signs do not mislead me.
28. As a User, I want Review to remain read-only with all statement rows available, so that I can check the result before confirmation.
29. As a User, I want included expenses first and excluded rows available with reasons, so that I understand what will and will not be saved.
30. As a User, I want Review to preserve my sort order and show a sticky included count and total, so that I stay oriented during a long statement.
31. As a User, I want Back to Categorize to restore my prior position and filters, so that I can make corrections without restarting my review.
32. As a User, I want success announced and brought into view, so that I know confirmation completed.
33. As a User, I want View Transactions to show the Committed Statement Import across all of its months, so that I can verify the expenses I just saved.
34. As a User, I want the statement scope, recorded activity range, count, and total visible, so that I understand that view's boundaries.
35. As a User, I want additional filters to narrow the statement view, so that I can investigate specific imported expenses.
36. As a User, I want a clear return to monthly browsing with the prior Reporting Period restored, so that I do not lose my previous context.
37. As a User, I want filtered counts and totals to describe the filtered result, so that they agree with the Transactions shown.
38. As a User, I want Monthly Insights to lead with selected-month Category risks, so that I can spot where to act before reading historical charts.
39. As a User, I want View Transactions, Edit Budget, and Set Budget actions where relevant, so that insight leads directly to a useful next step.
40. As a User, I want context preserved when opening an action and returning, so that I can investigate without rebuilding my view.
41. As a User, I want actual usage shown alongside elapsed-month progress, so that I can assess recorded spending pressure without an unreliable forecast.
42. As a User, I want potential unusual spending supported by a visible comparison and contributing Transactions, so that I can assess the signal myself.
43. As a User, I want insufficient recorded history explained, so that missing data is not presented as reassuring spending behavior.
44. As a User, I want recurring Budget breaches explained with eligible-month counts, so that I can decide whether to review my limit.
45. As a User, I want changes to recurring Budgets to explain their effect on historical comparisons, so that I understand the charts after editing.
46. As a mobile User, I want charts to start with three highest-spending Categories and a compact selector, so that I can compare spending without a long wall of controls.
47. As a User, I want chart inspection to expose amounts, Budget status, contributing Transactions, and actions, so that I can explain a spike.
48. As a User, I want inspecting a chart to preserve my Reporting Period until I explicitly choose View this month, so that exploration does not silently change other pages.
49. As a keyboard or assistive-technology User, I want equivalent chart details, accessible data tables, and predictable focus, so that the experience is usable without touch or sight.
50. As a User, I want consistent Category colors, status labels, and behavior on mobile and desktop, so that the same spending information remains recognizable everywhere.

## Implementation Decisions

### ID-1: Space identity and navigation

- Resolve the Space label from actual Space identity/kind, never from whether a Space ID was supplied. Personal routes with explicit IDs must still say Personal.
- Display the selected Space in the application shell and the locked import destination throughout Upload, Categorize, Review, and success. Keep the existing destination lock when a file is accepted.
- Keep the four mobile tabs. Rename the Categories navigation label to Budgets and retain Category management within that destination. Preserve existing route compatibility; a route rename is not required.
- Provide Manage Budgets from Dashboard and Monthly Insights. Category rows provide Edit Budget when a monthly Budget exists and Set Budget otherwise.
- Focus acceptance work on Personal Space. Preserve existing Space authorization and query/cache isolation; this is not a Shared Space redesign.

### ID-2: Exact Budget status and honest summaries

- Use exact cents for money comparisons and round only display values. For positive monthly limits, spending below 80% is Within Budget; at least 80% and below 100% is Nearing Budget; exactly 100% is At Budget Limit; above 100% is Over Budget.
- Use this policy consistently across Dashboard, Monthly Insights, Category summaries, and chart details. A displayed percentage rounding to 80% or 100% does not change the status.
- Categories without a monthly Budget, including Uncategorized, contribute to Unbudgeted Spending. A yearly Budget alone does not supply a monthly limit.
- Label the aggregate as Budgeted spending / total monthly limits. Its numerator is Budgeted Spending and its denominator is the sum of current monthly limits. Show total recorded spending and Unbudgeted Spending separately. Do not calculate a percentage when no monthly limits exist; offer a Budget setup action.
- Surface individual Category risks regardless of aggregate usage. Use labels and exact remaining/over amounts, not color alone. Empty recorded spending is not proof of a complete, healthy month.

### ID-3: Monthly Insights hierarchy and actions

- Lead Monthly Insights with the selected Reporting Period, recorded spending summary, and Category attention states. Historical totals and charts come afterward. Do not bury a Category breach in a lowest-spending ranking without its status.
- Provide contextual View Transactions and Edit Budget/Set Budget actions. Transaction actions carry the Space, calendar month, and Category. Budget actions identify the same Category and return to the prior view after completion or cancellation.
- Show actual Budget usage alongside elapsed-month progress for the current calendar month, labeled as recorded spending. Historical months show actual historical spending; numerical month-end forecasts are excluded.
- Filtered Transaction count and amount summarize the complete filtered result, across pagination, rather than just the visible page. Any whole-month figures are explicitly secondary and labeled as such.
- Preserve the existing current recurring Budget model. Before saving a new limit, explain that historical comparisons will also use it. Label historical comparisons as using current limits. Never automatically increase a limit; the User enters the amount and explicitly saves it.

### ID-4: Statement-scoped Transaction browsing

- Success passes the Committed Statement Import identity and destination Space to Transactions. Use the existing API statementImportId filter; a date range alone is not a substitute because unrelated expenses can have the same dates.
- Statement scope spans all committed expenses regardless of the currently selected calendar month. The web query/adapter must bypass its normal month clamp in this mode and include scope in query keys, pagination resets, and summaries.
- Show a visible statement filter, identifying statement context, recorded expense activity date range, filtered count, and filtered total. Do not describe earliest/latest expense dates as proof of complete statement-cycle or Space coverage.
- Replace the month picker while statement scope is active. Offer Return to monthly view, restoring the prior Reporting Period. Additional filters narrow the statement scope and never escape it.
- Do not transiently render a previously cached monthly list under a statement-scoped heading. Loading, empty, and failure states identify the requested scope and permit recovery.

### ID-5: Fast Category assignment and controlled bulk changes

- Keep routine Category assignment compact on mobile while retaining the full correction form in Categorize. Use stable parsed-row identities for selection and advancement.
- Default bulk candidates to included Unmapped expense rows with the same normalized full description within the current Statement Import. Matching follows existing case/whitespace normalization; it does not strip punctuation or infer merchant identity.
- Preview count and affected rows and allow deselection before applying. Preserve existing assignments unless the User explicitly selects them for replacement. Excluded rows must not be silently re-included or changed by the default bulk selection.
- Bulk assignment is temporary Manual assignment, distinct from saving a persistent Category Rule. Existing Rule evaluation must preserve already reviewed assignments.
- Individual Apply & next commits the assignment explicitly and advances to the next included Unmapped row in the selected order. If none remains, show completion feedback and the normal path to Review rather than committing the import automatically.
- Keep entered corrections, selections, and editor position on failure. Do not apply on Category selection alone.

### ID-6: Remember benefit, persistence, and recovery

- Keep Remember unchecked but prominent whenever useful, with benefit copy such as Save time next import—remember this description. Avoid repeated encouragement when an equivalent Rule already exists.
- Default to Exact. Offer Contains as an explicit broader option, explain its substring semantics, and preview matching rows in the current statement without promising knowledge of future rows.
- With Remember selected, use Apply & remember action language, persist the Rule immediately before applying the local assignment, and confirm Rule saved for future imports. This is separate from the later atomic Transaction import commit.
- Keep Rule save and local assignment together from the User's perspective: when Rule persistence fails or returns a conflict, apply no local assignment, retain inputs, and offer Retry or Apply without remembering. Do not introduce a new distributed transaction or claim a timed-out network request proves no server mutation occurred; retries must reuse an equivalent Rule safely.
- If normalized pattern plus match type already belongs to another Category, identify that Category and state the Rule was not changed. Allow assignment without remembering; never silently replace it. Reuse same-pattern/same-type/same-Category Rules without duplicates.
- Leaving or discarding the draft explicitly says that draft Transactions are discarded and already saved Rules remain. Do not describe this as undoing all changes.
- Preserve Exact precedence, Contains semantics, Space-scoped conflict protection, inactive-Category restrictions, and the guarantee that reviewed assignments are not rewritten.

### ID-7: Expense language, read-only Review, and success

- Present purchase expenses as expenses with positive readable expense amounts. Do not label them green Credit merely because the parser stores a negative signed activity value. Payment and other-credit rows keep accurate provider-supported descriptions; do not call every positive statement activity a payment.
- Preserve existing expense-only persistence and eligibility. Payments and other credits remain excluded from expense import; excluded eligible expenses can be re-included in Categorize. This spec does not add refund accounting.
- Review has no editing controls. Render included expenses first using the chosen sort order, plus an expandable excluded section explaining exclusion reasons. All parsed rows remain inspectable; Categorize's narrowing filters must not silently hide Review rows.
- Provide a sticky included expense count and total without obscuring content or controls. One Back to Categorize action restores that stage's prior sort, filters, and position; full corrections occur there.
- Keep reconciliation, duplicate warnings, and explicit confirmation. Confirmation commits included eligible expenses atomically under the existing API behavior.
- On success, scroll to and focus the confirmation heading, announce the result, show destination/count/total, and offer the statement-scoped View Transactions action.

### ID-8: Evidence-qualified potential patterns

- Category unusual-spending signals compare the selected month's recorded Category spending against a median baseline from up to six preceding calendar months. Do not reach further back to fill missing observations.
- Require at least three earlier comparison months with positive recorded spending in that Category. Exclude comparisons with no recorded Category spending; show insufficient recorded history when fewer than three qualify. Absence of a signal must not be described as proof that spending is normal.
- For the current month, compare through the same day of each earlier month, clamping to the last day of shorter months. For a historical selected month, use full calendar-month totals. Do not use later months or the selected month in its own baseline.
- Flag a potential pattern only when the selected amount is both at least 1.5 times the median comparison amount and at least PHP 500 above it. Compare exact amounts; retain sufficient precision for an even-sized median rather than rounding it before threshold checks.
- Explain the selected amount, comparison window/cutoff, contributing months, median, relative/absolute increase, and contributing Transactions. Describe a potential pattern in recorded spending rather than a definitive anomaly or affordability assessment.
- Suggest reviewing a monthly Budget when the Category exceeded its current limit in at least three of the last six eligible recorded Category months. Use completed calendar months at or before a historical selected period, or before the current partial month; exclude future periods and months with no recorded Category spending. Show the actual eligible denominator and explain current-limit comparisons.
- A Budget review suggestion opens the existing editor with evidence available; it never changes a limit automatically. Unbudgeted Categories instead offer Set Budget.
- Reconciled account extraction, statement dates, E-Wallet history intervals, and recorded activity ranges do not prove complete Space spending. Do not infer completeness or count empty months as confirmed Within Budget months.

### ID-9: Mobile chart configuration and inspection

- Default comparison selection to the three highest-spending available Categories for the displayed chart range, or all available Categories if fewer exist. Offer a compact selector for changing or adding Categories without requiring a long initial control list.
- Keep Category Color stable across views, renames, and sort changes. Multiple Categories may share a color; labels and other cues must distinguish them.
- Touch, pointer, and keyboard inspection expose a detail sheet/panel with the selected point's date/month, relevant totals, Category breakdown, Budget states, contributing Transactions, and contextual actions. Use readable month/year labels instead of ambiguous single-letter months.
- Inspection alone does not change Reporting Period. Explicit View this month selects that month; subsequent Transaction actions carry the inspected context. Dismissal restores focus to the chart control.
- Preserve accessible data tables and equivalent non-visual detail access. Avoid making an aria-hidden chart the sole interactive path. Overlay, sticky summary, and mobile tab-bar behavior must leave actions reachable.
- Daily spike inspection explains recorded contributions even when insufficient history prevents an unusual-spending signal. Inspection is distinct from claiming a statistically unusual pattern.

### ID-10: Architecture and contract boundaries

- Keep application-wide Space presentation, navigation, and route handoffs in application composition; maintain feature-owned pages, queries, services, and read models for Dashboard, Statement Import, Transactions, Insights, and Categories/Budgets.
- Share the exact Budget-status policy only across its concrete current callers. Reuse existing money, Reporting Period, Category identity, API transport, and accessible UI boundaries. Do not introduce cross-feature internal imports or a broad shared financial repository.
- Reuse the existing API statement filter, Rule endpoints, current Budget model, ownership enforcement, and atomic import commit. No schema migration or new API endpoint is currently required.
- If implementation discovers a missing contract capability, inspect the canonical API DTO/OpenAPI contract and the affected browser adapter together; keep generated contract artifacts API-owned and validate both projects. Do not silently replace statement identity filtering with date filtering.
- Update the design-system guidance and visual reference where implemented interaction/navigation changes supersede current guidance. Preserve unrelated working-tree changes and coordinate with the existing Category Suggestions work; this spec does not replace it.

## Testing Decisions

- The User confirmed the existing isolated browser → API → PostgreSQL journey as the primary acceptance boundary, supported by focused existing page/service tests. Add no test framework or production-only test interface.
- Good tests assert visible outcomes, persisted results, explicit scope, and recovery behavior rather than component internals, incidental CSS classes, or duplicated implementation logic. Prefer existing public feature and browser seams; use focused calculator/service tests where boundary combinations would make end-to-end tests redundant or brittle.
- Prior art includes the isolated synthetic User journey, mobile Statement Import layout and navigation tests, Insights layout/browser tests, Reporting Period tests, Transaction adapter/page tests, import workflow/Rule persistence tests, and API Space/statement-filter/atomic-rollback tests.
- Use fictional reconciled PDF fixtures through the real Upload and parsing path. Add a synthetic encrypted fixture for password handling and a statement spanning two calendar months. Do not commit or publish the User's financial statement, identifiers, password, or private review evidence as test data.
- Primary journey: Personal Dashboard → upload/unlock → repeated-description assignment and Remember → exclusion/re-inclusion → read-only Review → confirmation → statement-scoped Transactions → return to monthly view → Monthly Insights → filtered Transactions/Budget action → return. Assert saved expense count/amount, destination, and preserved context.
- Exercise representative 320px and 390px phone layouts and 1440px desktop layout using the existing browser suite. Verify no horizontal page overflow, reachable sticky/tab-bar controls, usable sheets, keyboard operation, accessible names, focus restoration, and success announcement. Check light/dark semantic contrast through existing design tokens.
- Exact status cases for a PHP 1,000 limit: PHP 799.99 Within Budget, PHP 800.00 Nearing Budget, PHP 999.99 Nearing Budget, PHP 1,000.00 At Budget Limit, PHP 1,000.01 Over Budget. Include rounding traps, no monthly Budgets, yearly-only limits, Uncategorized spending, and a Category breach hidden by low aggregate usage.
- Statement-view cases: two months plus unrelated same-date expenses; prior Reporting Period outside the statement; additional Category/date/search filters; pagination and complete filtered totals; scope-specific loading/error/empty state; return to prior month. Verify API statement filtering still enforces Space ownership.
- Categorize/Remember cases: normalized repeated descriptions, punctuation distinctions, preview/deselection, preservation of reviewed rows, excluded rows, Exact versus Contains, equivalent Rules, conflicting Rules, failed saves, retry after uncertain completion, Apply without remembering, and saved Rule survival after draft discard.
- Review cases: complete row visibility despite prior Categorize filters, consistent sort within included/excluded groups, reasons, payment/other-credit language, no edit controls, Back context restoration, failure/retry without duplicate commit, and focused success.
- Historical signal cases: two versus three eligible months, six-calendar-month window, omitted zero-spend comparisons, current-month equivalent-day cutoff, shorter months/leap years, historical full months, relative and absolute threshold equality, even-sized medians, no future leakage, incomplete-history messaging, and breach counts using current limits. A changed Budget must refresh dependent views and disclose historical effects.
- Chart cases: three-Category default and fewer-than-three fallback, selector changes, duplicate colors, touch and keyboard details, accessible tables, explained daily contributions, inspection without Reporting Period mutation, and explicit View this month navigation.
- Each implementation ticket runs its owning project's required checks. Before reporting a code change complete, run the repository-required isolated browser/API/PostgreSQL suite with node scripts/local-test-launcher.mjs --e2e. API contract changes additionally require canonical contract generation/checking and validation of the affected browser adapter. This documentation task does not claim runtime checks passed.

## Out of Scope

- Editing in Review; all corrections remain in Categorize.
- Numerical month-end forecasts, income tracking, affordability judgments, automated financial advice, or automatically changing Budget limits.
- Effective-dated/historical Budget versions or historical limit snapshots.
- Claims of complete Space/month coverage, new account-coverage tracking, or treating empty recorded months as verified low spending.
- New refund/payment accounting, changing expense-only commit semantics, relaxing reconciliation, or removing duplicate protections.
- Shared Space product redesign, membership changes, permission changes, multi-currency support, or a new Category Rule evaluation implementation in the API.
- Automatic conflicting-Rule replacement, remembering without opt-in, or saving bulk temporary assignments as Rules implicitly.
- Changing the four-tab mobile structure, introducing a test framework, implementing tickets during this specification task, or publishing private statement evidence.

## Further Notes

### Proposed implementation-ticket boundaries

These are work packages for subsequent ticket creation, not child issues created by this task. Stories and acceptance checks above remain part of the parent specification. Dependencies refer to work-package IDs until actual tickets exist.

| Work package | Deliverable and acceptance boundary | Stories | Depends on |
| --- | --- | --- | --- |
| T1 — Space identity and Budget navigation | Correct explicit-ID Personal labels throughout the journey; four tabs retained; Budgets menu and contextual discovery. | 1–4 | None |
| T2 — Exact Budget states and summary scope | Consistent threshold states; aggregate versus individual risks; Budgeted/Unbudgeted figures; filtered count/total semantics. | 5–9, 37 | None |
| T3 — Committed statement Transaction view | Cross-month statement identity filtering, visible scope, compatible extra filters, pagination/summary, restoration of prior monthly view. | 33–36 | T2 |
| T4 — Mobile and bulk categorization | Compact assignment, full corrections, preview/deselection, protected existing assignments, Apply & next, reversible eligible exclusions. | 11–16, 26 | None |
| T5 — Remember encouragement and safe recovery | Exact default, Contains preview, explicit opt-in/immediate persistence, conflict/equivalence handling, retry/assignment-only recovery, honest discard copy. | 17–25 | T4 |
| T6 — Read-only Review and import success | Expense/credit language, complete grouped rows, sticky summary, preserved order, Back context, announced success, statement-view handoff. | 10, 27–32 | T3, T4, T5 |
| T7 — Monthly monitoring and contextual actions | Selected-month attention first, usage/progress presentation, Transaction/Budget actions with return context, historical-limit disclosure. | 38–41, 45 | T1, T2, T3 |
| T8 — Recorded-history spending signals | Conservative median comparison, eligibility/noise thresholds, explained evidence, recurring-breach Budget review suggestions, insufficient-history states. | 42–44 | T2, T7 |
| T9 — Mobile chart inspection and selection | Three-Category default, compact selector, accessible touch/keyboard details, spike contributions, explicit month navigation. | 46–49 | T2, T3, T7 |
| T10 — Integrated journey and consistency verification | Real isolated end-to-end acceptance across mobile/desktop; context, persistence, accessibility, and financial regression checks; reconcile design-system/reference updates. | 1–50, especially 50 | T1–T9 |

T10 is the final integrated acceptance package; each preceding ticket still owns the meaningful regression tests for its behavior. Independent packages may proceed in parallel, but dependencies must be represented explicitly when child tickets are created. Existing Category Suggestions work remains a separate capability and must not be overwritten.

### Decision provenance and publication

- Source: mobile-first UX review and four-round design session dated 30 September 2026. The User accepted all ten recommendations as refined by eighteen answered questions, including read-only Review, prominent optional Remember, and deferred numerical forecasts.
- Test boundaries were subsequently confirmed by the User during this to-spec session.
- This spec supersedes conflicting proposals in the original UX review. Existing accepted Rule-storage and reconciliation ADRs remain in force.
- GitHub publication: [yororo/spendeazy#75](https://github.com/yororo/spendeazy/issues/75), labeled ready-for-agent. Subsequent decomposition can create the proposed implementation tickets. This local artifact is the requested spec-file export; the GitHub issue is the implementation source of truth.
