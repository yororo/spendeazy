# UX design interview — 30 September 2026

This is a record of the grill-with-docs interview, not an implementation specification. GitHub Issues remain the repository's issue/spec source of truth. Implementation has not started.

## Settled scope

- Proceed with all ten top recommendations from the completed UX review.
- Prioritize mobile while keeping desktop behavior consistent.
- Keep Review read-only. Corrections remain in Categorize; do not add editing to Review.
- Preserve clear selected Space and import destination information.
- Nearing Budget begins at 80% actual usage; exactly 100% is At Budget Limit; Over Budget requires actual spending above the limit. Defer numerical forecasts; show actual usage alongside elapsed-month progress, labeled as recorded spending.
- Spending-health assessments use Category Budgets and recorded spending changes; this work does not add income or affordability modeling.
- Bulk assignment defaults to Unmapped rows with the same normalized full description in the current statement, with preview and deselection. Existing assignments are preserved unless explicitly selected for replacement.
- Keep temporary bulk assignment separate from persistent Category Rules. Remember is unchecked but prominent, defaults to Exact, explains future benefit, and previews matches. Explicit opt-in saves the Rule immediately; it survives leaving the draft.
- Retain four mobile tabs: Dashboard, Imports, Transactions, Insights. Rename the existing Categories navigation destination to Budgets; retain Category management inside it. Add contextual Budget actions.

## Design tree

- Monthly monitoring
  - Settled: prioritize the selected month's Category risks before historical charts.
  - Settled: nearing starts at 80%; over requires spending above the limit; projections are separate.
  - Settled: exactly equal is At Budget Limit; status uses exact amounts.
  - Settled: spending-health scope is Category Budgets and recorded history, not income/affordability.
  - Settled: historical signals use up to six preceding calendar months, require three earlier Category expense months, a 50% and PHP 500 increase over the median comparison amount, equivalent elapsed days for the current month, and visible contributing months. Exclude comparisons with no recorded Category spending. No complete-coverage claims or numerical forecasts.
  - Settled: suggest reviewing a Budget after breaches in three of the last six eligible months, using current limits; the User enters any new limit.
  - Settled: label aggregate Budgeted Spending against total monthly limits, show Unbudgeted Spending separately, and surface individual Category breaches.
- Actions and navigation
  - Settled: contextual actions from Insights to Transactions and Budget editing.
  - Settled: Budgets navigation label; retain four mobile tabs and add contextual actions.
  - Settled: post-import Transactions are scoped to the Committed Statement Import across months, with visible scope and a return to the prior Reporting Period.
  - Settled: filtered summaries are primary; whole-month totals are explicitly secondary. Actions carry month and Category; return restores the prior view.
- Categorize
  - Settled: reduce Category assignment effort; retain full correction forms.
  - Settled: normalized full-description matches within this statement; default to Unmapped; preview and deselect; explicit replacement of existing assignments.
  - Settled: prominent unchecked Remember, Exact default, future benefit, match preview, explicit Contains, and no redundant equivalent-Rule prompt.
  - Settled: explicit Apply & next skips to the next included Unmapped row; bulk changes use preview. Failed saves retain inputs and position.
  - Settled: Apply & remember saves a persistent Rule immediately with clear feedback; leaving discards draft Transactions but retains saved Rules.
  - Settled: assignment and Remember succeed together. Failure retains editor inputs and applies neither change, with Retry and Apply without remembering actions. Conflicting Rules name the existing Category and are never silently replaced; equivalent Rules are reused.
- Review and success
  - Settled: Review remains read-only.
  - Settled: one Back to Categorize restores position and filters; no Review editing controls.
  - Settled: preserve sort, show sticky included count and total, and focus/scroll to success heading.
  - Settled: show included expenses first and an expandable excluded section with reasons. Use expense/payment language from the approved review; identify other credits accurately rather than calling every positive statement activity a payment.
- Charts and accessibility
  - Settled: simplify phone Category configuration and improve readable detail.
  - Settled: default to three highest-spending Categories with a compact selector. Tap opens amounts, Budget status, contributing Transactions, and actions in a detail sheet. Only explicit View this month changes the Reporting Period. Retain accessible tables and stable colors.

## Round 1 — answered

1. Near-Budget threshold and whether projected pace changes the status.
2. Spending-health scope: monthly Budgets and recorded history, or a new income/affordability model.
3. Repeated-description assignment boundary and overwrite policy.
4. Budget navigation naming and mobile placement.

The User accepted all four recommendations and additionally requested that the UI entice Users to remember Categories for future imports wherever useful.

## Verified constraints

- The import Space badge currently infers Shared from a defined Space ID; Personal imports pass an explicit ID. The destination is fixed when the file is accepted.
- The API already supports statementImportId filtering. The web service does not expose it and clamps custom date ranges to the monthly Reporting Period.
- Dashboard rounds percentages before testing near/over thresholds; Insights compares exact spending and treats only values above the limit as over. Implementation must use exact values for status and round only for display.
- Budgets are recurring current limits with no historical versions. Insights applies current limits to historical comparisons.
- Existing Exact/Contains Rules are Space-scoped, with normalized matching and preserved reviewed assignments. Reconciliation remains fail-closed under the accepted ADRs.
- Charts have accessible data tables but no plot drill-down. Recorded Transactions cannot establish complete calendar-month coverage.

## Round 2 — answered

- Exact-limit presentation.
- Remember defaults, explicit consent, and Exact/Contains preview.
- Cross-month statement browsing and return to normal monthly browsing.
- Current recurring Budget changes versus introducing historical versions.
- Historical evidence requirements for unusual-pattern signals and projected pace.

The User accepted all five recommendations:

- Status uses exact amounts: below 80% Within Budget; 80% to below 100% Nearing Budget; exactly 100% At Budget Limit; above 100% Over Budget. Round only displayed numbers.
- Remember stays unchecked but prominent, explains its future benefit, defaults to Exact, previews matches, and offers Contains explicitly. Suppress redundant encouragement when an equivalent Rule exists.
- Success opens Transactions scoped to the Committed Statement Import across all its months, with visible statement filter, activity date range, count, and total. Replace the month picker while scoped; returning to monthly browsing restores the previous Reporting Period. Additional filters narrow the statement scope.
- Keep current recurring Budget limits, disclose that changing them affects historical comparisons, and label those comparisons. Defer historical Budget versions.
- Describe unusual patterns as potential patterns in recorded spending; expose the comparator and contributing Transactions. Require at least three earlier months containing recorded expenses for historical signals, exclude empty months from baselines, and never claim complete Space spending coverage.

## Additional verified constraints

- Remember currently defaults to Contains, contrary to accepted API ADR 0003's Exact default. The approved Exact default restores that documented decision rather than reversing it.
- Remember saves a Category Rule immediately on row Save, before import confirmation. Leaving the draft does not undo saved Rules. The existing discard warning overstates what it discards.
- E-Wallet history intervals and reconciled extraction do not establish complete Space spending. Credit Card provenance has no coverage interval; purchase date ranges describe recorded activity only.

## Round 3 — answered

- Timing and disclosure of persistent Remember changes.
- Historical pattern calculations, noise thresholds, and Budget-adjustment evidence.
- Conditions for projected pace.
- Category assignment save/next behavior and error handling.
- Read-only Review, order, exclusions, and correction return context.
- Chart defaults, touch inspection, and Reporting Period changes.
- Aggregate Budget presentation, filtered summaries, and contextual action scope.

The User accepted all seven recommendations (Q10–Q16). The settled design tree above records the resulting behavior. Numerical forecasts are explicitly deferred; this supersedes the earlier conditional projection direction.

## Round 4 — answered

- Q17: Use up to six preceding calendar months, requiring at least three with recorded Category spending. For the current month, compare through the same day of earlier months. Exclude comparisons without recorded Category spending; expose contributing months and do not imply complete coverage.
- Q18: Keep the assignment and Rule save together. On failure, apply neither change, preserve inputs, and offer Retry or Apply without remembering. Name the Category of a conflicting Rule and offer assignment without remembering; do not silently replace it. Reuse equivalent Rules without creating duplicates.

The User accepted both recommendations. Fact checking confirmed that current Remember persistence already precedes row assignment and that conflicts do not automatically replace Rules; the redesign makes these outcomes and recovery actions explicit.

## Session outcome

All eighteen questions were answered and their recommendations accepted. The design frontier is empty, and the User confirmed the shared understanding through the final agreement. The accepted interview decisions refine the ten recommendations in report.md and take precedence wherever that original review proposed different behavior, particularly editing in Review and numerical forecasts.

This session changed documentation only. App implementation, GitHub implementation issues, and runtime validation have not been performed. Implementation should use the repository's GitHub issue workflow, preserve unrelated working-tree changes, and run the required isolated end-to-end suite before completion. No ADR was added: these decisions preserve existing persistence and recurring-Budget boundaries, and the remaining presentation/calculation choices do not warrant a hard-to-reverse architectural decision record.

Settled terms will be added to root CONTEXT.md when they introduce or refine domain vocabulary. ADRs will be reserved for decisions with meaningful reversal costs and a real trade-off.
