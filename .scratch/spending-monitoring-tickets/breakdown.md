# Approved implementation tickets for spec #75

Approved and published as GitHub issues #76–#88. All thirteen issues and seventeen native dependency links were verified. Parent #75 remains open and unchanged. See [published tickets](published-tickets.md) for issue links and dependencies.

The ten spec work packages are decomposed into thirteen demonstrable slices. Filtered Transaction summaries, bulk assignment, and recurring Budget review each get their own slice. No standalone horizontal prefactor is needed: narrow compatibility-preserving changes belong in the first slice that uses them.

## 1. Show correct Space identity and discoverable Budget navigation

Blocked by: None.

Users see Personal consistently throughout the application and Statement Import, and can find Budgets while retaining the four mobile tabs.

[Full draft acceptance criteria](01.md)

## 2. Make monthly Budget status and Dashboard summaries consistent

Blocked by: None.

Dashboard distinguishes total, Budgeted, and Unbudgeted Spending and exposes Category risks even when aggregate usage is low; all existing Budget presentations use exact status boundaries.

[Full draft acceptance criteria](02.md)

## 3. Make filtered Transaction counts and totals match the result

Blocked by: None.

Users filtering Transactions see the complete filtered count and expense total, with clearly secondary whole-month context.

[Full draft acceptance criteria](03.md)

## 4. Open newly imported Transactions across every statement month

Blocked by: 3.

After a confirmed import, Users see a focused success message and can browse precisely the saved statement expenses across months before returning to their previous monthly view.

[Full draft acceptance criteria](04.md)

## 5. Make individual mobile categorization fast and explicit

Blocked by: None.

Users assign Categories in a compact phone interaction, retain full corrections, and explicitly advance through included Unmapped Transactions.

[Full draft acceptance criteria](05.md)

## 6. Apply Categories to repeated statement descriptions with preview

Blocked by: 5.

Users categorize repeated descriptions in one statement through a controlled preview without overwriting previously reviewed work.

[Full draft acceptance criteria](06.md)

## 7. Encourage Remember with safe Rule saves and clear recovery

Blocked by: 5.

Users understand Remember's future benefit, opt into a predictable Exact Rule, and recover from failure or conflict without losing their draft.

[Full draft acceptance criteria](07.md)

## 8. Keep Review read-only and preserve correction context

Blocked by: 5.

Users inspect every parsed statement row with clear expense/exclusion language and return to Categorize for corrections without losing their place.

[Full draft acceptance criteria](08.md)

## 9. Lead Monthly Insights with actionable Category risks

Blocked by: 1, 2, 3.

Users immediately see selected-month risks and can investigate Transactions or edit/set a Category Budget while preserving context.

[Full draft acceptance criteria](09.md)

## 10. Explain potential unusual Category spending using recorded history

Blocked by: 9.

Users see conservative potential-spending-pattern signals with transparent comparison evidence and contributing Transactions, or an honest insufficient-history state.

[Full draft acceptance criteria](10.md)

## 11. Suggest Budget review from recurring breaches and disclose historical effects

Blocked by: 9.

Users can assess recurring Category breaches, review a current recurring Budget, and understand that changing it affects historical comparisons.

[Full draft acceptance criteria](11.md)

## 12. Make chart selection and spending inspection usable on phones

Blocked by: 9.

Users inspect monthly trends and daily spikes through readable touch/keyboard details and a compact Category selector without silently changing their Reporting Period.

[Full draft acceptance criteria](12.md)

## 13. Verify the complete mobile spending-monitoring journey

Blocked by: 4, 6, 7, 8, 10, 11, 12.

A deterministic isolated browser/API/PostgreSQL journey proves the full redesigned experience works consistently from Dashboard through import and spending actions.

[Full draft acceptance criteria](13.md)

