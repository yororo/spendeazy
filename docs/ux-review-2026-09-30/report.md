# Spendeazy UX/UI review — 30 September 2026

Status: complete for the requested local-browser journey. The supplied statement was unlocked by the User, categorized, reviewed, committed once into Personal, and verified in Transactions and Insights. Findings distinguish observed behavior from proposed enhancements.

## Scope and evidence

Reviewed the local synthetic instance at `http://127.0.0.1:5174` in the Codex Browser. Used only the populated User's Personal Space. Prioritized a 390 × 844 viewport, checked a compact 360 × 800 viewport, and compared a 1440 × 1000 desktop viewport. These are responsive browser checks, not physical-device tests of touch, the mobile keyboard, or the operating system's PDF picker.

Inspected Dashboard, Statement Import upload, Categorize, Review and success, Transactions and its filter drawer, Monthly and Daily Insights, Categories/Budget overview, the mobile navigation drawer, and the monthly Budget editor without saving Budget changes. Compared Categorize and Review on mobile and desktop. Confirmed that a selected Reporting Period carries between Dashboard, Transactions, Categories, and Insights, and that Dashboard Budget attention links preserve the month and apply a Category filter.

The test harness initially had a session/API problem; the User restarted it and access succeeded. This is excluded from product UX findings. Browser file-chooser automation timed out both from Browse files and from the actual file input; the User completed file selection and password entry, then the rest of the journey was tested through the Browser. The picker timeout is a testing limitation, not evidence that the product's uploader is broken. Wrong-password recovery and the password-entry experience were not directly tested.

The visible baseline contained six September Transactions totaling ₱1,390, ₱1,300 in monthly-budgeted Categories, ₱90 Uncategorized, and ₱6,900 in current monthly Budgets. After import, May and June provided actual over-Budget and unbudgeted-spending scenarios. The Budgets are those of the local test fixture; the recommendations concern presentation and workflow rather than deciding the User's real spending limits. A near-Budget state was not independently generated, and the UI did not present explicit anomaly detection.

## Completed journey and verification

| Step | Result | UX implication |
| --- | --- | --- |
| Open app / Dashboard | Access resumed after the local instance restart; Personal was selected | Persistent Space selector and bottom navigation provide orientation |
| Upload and unlock | User selected the supplied BDO AMEX statement and entered its password | Manual picker/password entry were outside automation coverage |
| Categorize | 46 statement activity rows: 45 expenses and one payment; 4 expenses matched existing Rules; 41 were manually categorized | Full edit forms make a long mobile categorization pass expensive |
| Exclude / re-include | Excluded the ₱340 BOB row, observed Review decrease from 45 to 44, then restored it to 45 | Reversible exclusion works; no legitimate expense remained excluded merely for testing |
| Review | All 45 expenses had Categories; Category breakdown totaled ₱56,040.04 | Destination text was Personal, but the page badge incorrectly said Shared; expense badges said Credit |
| Confirm | Committed once; success reported 45 Transactions saved to Personal Space | Success retained the previous scroll offset; View Transactions did not select the statement's months |
| Transactions | September initially showed only the 6 original fixtures; manually selecting May/June revealed 25/20 imported expenses | Post-import navigation can make a successful import look missing |
| Insights | June Monthly showed a 12-month total of ₱56,040.04; Food & Drink appeared under Frequently over Budget and Lowest spending | Monthly decisions and budget risk need clearer hierarchy and wording |

The source PDF's dated activity rows contain exactly 45 positive purchases totaling ₱56,040.04 and one payment. Their calendar-month counts and totals match the saved UI: May has 25 expenses / ₱26,966.60; June has 20 / ₱29,073.44. Spot-checked merchant descriptions, transaction dates, and amounts matched; no numerical correction was needed. The app uses the transaction date rather than the PDF's posting date for these Reporting Periods.

Merchant-based manual assignments were used for the UX test: groceries/warehouse and supermarket purchases to Groceries; dining merchants to Food & Drink; retail/e-commerce to Shopping; pharmacy and personal-care merchants to Health & Wellness; Apple billing to App Subscriptions. Such assignments do not establish item-level accuracy, which the statement cannot provide. No new persistent Category Rules were saved. The existing 4 Rule matches were retained. No Budget limits were changed, no Shared Space was selected, and no app source was modified.

## Highest-priority verified fixes

### A. Correct the contradictory import Space badge — P1

Categorize, Review, and Complete display a bright `Shared` badge while the navigation selector and explicit destination say Personal. The success record confirms that the import went into Personal. This is a display inconsistency, not evidence of a cross-Space write.

For financial data, the contradiction undermines confidence precisely when the User is deciding where to save expenses. Derive every Space label from the same destination context and use `Import into Personal` consistently. Keep the destination fixed through the review flow, or require an explicit destination change with a visible consequence. Validate all three stages on both mobile and desktop. [Mobile evidence](mobile-review.jpg), [desktop evidence](desktop-review.jpg).

### B. Make View Transactions show the just-imported statement — P1

After saving 45 May/June expenses, `View Transactions` landed on September, showing 6 old fixture Transactions. All newly imported expenses were invisible until the month was manually changed.

Open a statement-specific Transaction view or preselect the imported date range. Since a statement can span calendar months, choosing only its statement month is insufficient. A useful success panel would offer `View all 45 imported Transactions`, `May: 25`, and `June: 20`, with the saved amount. Preserve ordinary Reporting Period behavior outside this explicit post-import action. [Evidence](post-import-transactions-default.jpg).

### C. Use coherent expense/payment language throughout import — P1

Review labels purchase rows `Credit` in green and accessible text says `Credit. Included in import.` At the same time, desktop summaries say `Total debits` and the Category breakdown says `Included, categorized debits`. The payment is labeled `Debit` during Categorize and excluded. Negative purchase amounts are also shown in the edit form, unlike the domain's positive expense model.

Use user-facing `Expense` and `Payment — excluded` labels. Show an unsigned amount in an expense editor with its type stated clearly, and use a consistent expense sign convention in lists. Explain why the payment does not count as spending. This avoids requiring Users to interpret internal credit/debit conventions and makes inaccuracies easier to recognize. [Evidence](desktop-review.jpg).

### D. Make current Category breaches unmistakable — P1

June Food & Drink is ₱4,024.14 against a ₱1,800 monthly Budget: 223.6% used and ₱2,224.14 over. Yet Dashboard aggregate usage is 58.3% because it compares the same ₱4,024.14 with all ₱6,900 of monthly limits. Monthly Insights lists Food & Drink under `Lowest spending`, alongside four zero-spend Categories, without a Budget-breach label in that list.

Do not present aggregate remaining amounts as evidence that every Category is healthy. Lead with Category status and show `1 Category over Budget` alongside aggregate usage. Replace Lowest spending with a more actionable comparison, or at least label every ranked row's Budget status and exclude over-Budget rows from any implied savings opportunity. Dashboard already calculates the correct over amount; reuse that information in Insights. [Dashboard evidence](post-import-budget-attention.jpg), [ranking evidence](post-import-lowest-spending.jpg).

### E. Preserve orientation between import stages and shorten the correction loop — P1

Categorize uses newest-first rows, while Review returns to the PDF's source/card grouping; late-May and Apple rows reappear after June rows. Review has no per-row correction action, requiring a return to Categorize and another search. Confirmation is at the end of a long 46-row list on mobile. After import, the success page retains the prior scroll offset, hiding its confirmation heading until scrolling up.

Keep a consistent sort order and mark stage changes clearly. Offer per-row Edit on Review, returning to the same row and scroll position. Show a sticky review footer above mobile navigation with `45 expenses · ₱56,040.04 · Import into Personal`, plus a clear included/excluded breakdown. Scroll to the top of the success stage and focus its heading. Explain available post-save corrections accurately; `cannot be undone` should distinguish the absence of batch rollback from any existing individual Transaction edit/recovery options.

At 390 px, the success content also measured 10 px wider than the main content area (385 px scroll width versus 375 px client width). Wrap long statement filenames and make nested cards obey the available width; confirm the page requires no horizontal scrolling.

## Overall assessment

Spendeazy has a recognizable visual system and a useful distinction between budgeted and unbudgeted spending. Its responsive transaction cards and persistent mobile navigation are a good base. The strongest improvement is to make monthly monitoring a short decision loop: see the problem, understand its cause, and take an action while retaining the selected month and Space.

Monthly Insights currently behaves mainly as a historical chart explorer. It requires the User to interpret stacked bars, compare multiple budget reference lines, and configure Categories before reaching useful conclusions. On a phone this produces considerable scrolling before the User can decide what to do.

## Prioritized recommendations

### 1. Lead Monthly Insights with the selected month's decisions — P1

**Observed:** Monthly Insights leads with a 12-month spending total and a 12-month budgeted spending total. The month picker scopes a rolling window ending in the selected month. Current-month risk is not the first thing presented. Frequently over Budget is below two chart sections; Lowest spending is the other ranking. There is no similarly prominent list of Categories nearing their Budget this month.

**Impact:** A User opening Monthly to monitor a monthly Budget must first determine the page's time scope and then infer what requires attention. A large annual total is not a quick answer to whether this month is on track.

**Recommendation:** Keep Monthly as the default and place these elements first:

1. Explicit context: `Personal · September 2026`.
2. This month's total spending, budgeted spending/limit, and unbudgeted spending.
3. `Needs attention` rows ordered by severity: over Budget, approaching Budget, and significant unbudgeted spending.
4. A concise change explanation against a comparable prior period when enough data exists.
5. Historical trend exploration below the action summary, labeled `12-month trends`.

Each attention row should show Category, spent/limit, percent used, and a concrete amount remaining or over. For the verified June data, use `Food & Drink · 223.6% used · ₱2,224.14 over`. Include text and icons alongside color, and keep unbudgeted Categories clearly separate from Categories with a breached limit.

**Acceptance:** At 390 px wide, a User can identify the highest-priority Category and its remaining/over amount without configuring a chart. The first screen makes the selected month and the totals' scope unambiguous.

### 2. Connect every insight to an action — P1

**Observed:** Insights offers period selection, Monthly/Daily switching, Budget overlays, and Category comparison. The inspected view does not expose direct `View Transactions` or `Edit Budget` actions beside the rankings. Budget editing lives under Categories, which is outside the mobile bottom navigation.

**Impact:** The User can see data but has to reconstruct the context in another screen to investigate or change a limit.

**Recommendation:** Give Category attention rows and trend details contextual actions: `View Transactions`, `Edit Budget`, or `Set Budget`. Carry the selected Space, month, and Category into the destination. Return the User to the same Insight and scroll position after editing. Make Uncategorized spending actionable through `Categorize Transactions`.

Dashboard already implements the Transaction action: selecting the June Food & Drink warning opened eight matching Transactions while preserving June and Personal. Reuse this behavior in Insights. The filtered Transactions screen still showed the whole-month summary (20 Transactions / ₱29,073.44) above eight Food & Drink rows. Label that summary `All June spending` and add a filtered subtotal of ₱4,024.14 to avoid scope ambiguity.

Budget suggestions should explain their basis, such as repeated breaches over recorded months, rather than automatically encouraging a higher limit. Provide the spending history and current limit side by side. Budget changes should be intentional and preview their effect on current historical comparisons.

**Acceptance:** The User can go from a Category warning to its matching Transactions in one action, or open its Budget editor directly, with no need to reselect the month or Category.

### 3. Elevate Budget attention in the mobile Dashboard — P1

**Observed:** The Dashboard presents total spend, Transaction count, top Category, average/day, budgeted usage, and unbudgeted spending before Budget attention. On mobile these six metrics stack across multiple rows. The bright-green total spend card dominates the initial screen. Budget attention appears farther down.

**Impact:** The quick overview favors activity statistics over actionable Budget health. A User needs to scroll to discover the most useful warning area.

**Recommendation:** Put total spend and monthly Budget health first, followed immediately by Budget attention. Keep count, top Category, and average/day in a compact secondary strip or expandable detail. Make the attention component consistent with Monthly Insights, using the same thresholds, terminology, and action destinations.

When there is no spending, say `No Transactions recorded for June` and offer Import statement or Record Transaction. Avoid letting a large empty chart and `No Categories need attention` imply that the User's finances are fully tracked.

**Acceptance:** Budget attention begins before secondary statistics consume several phone screens. Empty-period views communicate missing recorded activity and a useful next action.

### 4. Make Budget management discoverable — P1

**Observed:** The desktop navigation item is Categories, while the destination title is Budget overview and its main section is Monthly Budgets. On mobile, Categories is in the hamburger drawer rather than the persistent navigation.

**Impact:** A User looking for `update my Budget limits` may not expect to find that task under Categories.

**Recommendation:** Rename the navigation entry to `Budgets` or `Categories & Budgets`, retaining Category management inside it. Add direct `Manage Budgets` entry points on Dashboard and Insights. Keep the four-tab mobile navigation if desired; contextual Budget actions can avoid adding a crowded fifth tab.

The existing Budget editor correctly explains that the Budget recurs independently of the selected Reporting Period. Preserve that clarification and consider plainer copy: `This monthly limit applies across months.` Show a separate warning when historical comparisons will change.

**Acceptance:** A User can locate Budget editing from either monitoring screen without exploring the hamburger menu or knowing the internal Category/Budget relationship.

### 5. Make all-spending and Budget comparisons visually honest — P1

**Observed:** Monthly stacked bars include all Transactions, while the dashed Budget reference and Over Budget markers compare only Budgeted Spending. Repeated explanatory paragraphs are needed to explain this difference. Historical comparisons use current Budget limits. The visible September baseline includes Uncategorized spending, while Dashboard Budget attention says no Categories need attention.

**Impact:** A total bar above a Budget line can look like a Budget breach even when its unbudgeted portion drives the difference. Conversely, a healthy budgeted percentage can obscure substantial spending outside monthly Budgets. Uncategorized spending also requires a different action from a correctly categorized expense lacking a Budget.

**Recommendation:** Visually separate budgeted and unbudgeted amounts and provide a compact adjacent breakdown. Show `Budgeted spending / monthly limits` as the comparison, with `Unbudgeted spending` clearly outside it. Separate `Uncategorized` from categorized-but-unbudgeted spending in attention actions.

Consolidate the repeated caveat into one short, persistent explanation with an expandable details section. Label reference lines `Current limits applied to past months`. If historical Budget snapshots are added later, clearly distinguish actual historical limits from comparisons recalculated using today's limits.

**Acceptance:** Users can explain which spending is compared with the line without reading multiple paragraphs. Unbudgeted and Uncategorized amounts remain visible and actionable even when budgeted spending is below its limits.

### 6. Add explainable unusual-spending signals and data coverage — P1

**Observed:** The inspected Insights view presents trends and historical breach counts but no explicit unusual-spending explanation. Before import, eleven months had no recorded expenses; afterward, the June-ending view contained ten zero-recorded months and two populated months. The accessible monthly values describe zero months as Within Budget. Food & Drink's breach frequency is `2 / 12`, although only May and June have spending in this window. The statement covers portions of both calendar months. Daily spending visibly spikes on June 14 because of the large S&R Transaction, but no explanation or investigation shortcut accompanies that spike.

**Impact:** Sparse imports can make spending appear to surge or create unjustified confidence that prior months were healthy. A single expensive day is also not automatically an unusual behavior.

**Recommendation:** Use recorded-history coverage as part of every comparison. Prefer `No spending recorded` to an unqualified `Within Budget` for a month with no Transactions. Do not equate absence of recorded Transactions with a fully reconciled zero-spend month.

Add evidence-based signals such as `Category spending is higher than its recent recorded-month average` or `Several large Transactions occurred this week`, with the comparator, sample size, and a link to the contributing Transactions. Suppress strong conclusions when history is insufficient. For the current month, compare like-for-like elapsed periods and keep one-off purchases distinct from recurring patterns.

**Acceptance:** Sparse history produces `Not enough history for a reliable comparison`, rather than a confident spike interpretation. Every anomaly links to the expenses and explains its baseline.

### 7. Reduce chart setup and reading effort on phones — P2

**Observed:** The Category trend section shows 19 Category buttons before the plot. Five baseline Categories are selected, producing multiple spending lines and multiple Budget reference lines. Mobile month labels use single letters, including repeated J and M labels. Several Category colors are close in hue. The warnings and Lowest spending rankings appear after these sections.

**Impact:** Control configuration dominates the scroll path. Similar lines and ambiguous labels make it difficult to connect an expense pattern to the right Category.

**Recommendation:** Preserve the useful automatic selection of the top few relevant Categories: after import it selected the five spending Categories. Move the full 19-Category configuration into a searchable `Compare Categories` sheet with a clear selected count. Provide presets such as `Needs attention`, `Top spending`, and `Selected Categories`. Keep only selected chips near the chart.

Use `Jan`, `Feb`, etc. with fewer ticks or a horizontally navigable plot on phones. Support tapping a month/Category to show a persistent readable detail panel, not a hover-only tooltip. Consider small Category charts with their own Budget reference rather than overlaying many differently scaled limits. Preserve named Category colors, adding line patterns and labels so color is not the only identifier. Keep the existing accessible data tables.

**Acceptance:** A User can read exact values and identify the selected Category using touch or keyboard. Configuration does not occupy a full screen before the chart.

### 8. Simplify mobile upload and progress communication — P2

**Observed:** The upload page uses a large drop area and `Drop statement file here`. At phone width, the Categorize step truncates to `CATEGORI…`. Supported providers sit in the guidance section below the uploader. The privacy explanation appears both in the upload area and in a separate panel. The Dashboard Import statement shortcut becomes an icon-only button on mobile.

**Impact:** The first screen spends space on a desktop interaction and hides information that determines whether the PDF is supported. Truncated progress labels weaken orientation.

**Recommendation:** On phones use a compact `Choose PDF statement` card with supported provider names and the 25 MB limit visible together. Retain drag-and-drop on desktop. Use a compact `Step 1 of 3 · Upload` pattern or allow step labels to wrap fully. Keep one concise privacy statement and expandable details. Give the Dashboard shortcut a visible `Import` label when space permits.

Categorize, exclusions, Review, and commit confirmation were subsequently tested; the verified issues are documented above. The User performed password entry, so password usability and failed-password recovery remain outside coverage. Improve the categorization loop with a Category-only picker, `Save and next unmapped`, a remaining-work count, and optional `Apply to these matching rows` that is independent of saving a persistent Rule. The eight Apple expenses are a concrete example of useful same-merchant grouping. Preview affected rows before bulk assignment; preserve a full edit form for date/description/amount corrections.

**Acceptance:** At 360 px, the User can read the current step, understand the supported file types/providers, and find file selection without a long scroll.

### 9. Tighten Transactions filtering and recovery presentation — P2

**Observed:** Mobile Transaction cards show description, Category, expense amount, date, and Account clearly. Filters open in a full-height drawer and update immediately. The filter drawer has `Sort loaded rows by`; its close control is named `Close navigation`. Deleted Transactions has a second complete search/filter area even when empty.

**Impact:** `Loaded rows` exposes implementation detail and can leave sort scope ambiguous. An icon-only close does not tell the User whether the filter changes are applied. Empty deleted-history tools compete with the active list.

**Recommendation:** Use `Sort by` with an explicit explanation only when sorting is limited to loaded results, or support sorting across the matching results. Label the close control `Close filters`; include a prominent `Show N Transactions`/`Done` action while preserving immediate updates. Display selected filter chips and Clear all on the list.

Collapse Deleted Transactions into a `Recently deleted` disclosure with a count. Keep restore actions discoverable after a deletion. For the post-import journey, provide a filter or entry point for the just-imported statement so the User does not have to reconstruct its date range.

**Acceptance:** The User can identify active filters, know how to return to results, and determine the scope of sorting. Empty recovery tools do not occupy a full extra browsing section.

### 10. Preserve clear Space context while reducing repeated decoration — P2

**Observed:** Personal is visible in the header/sidebar Space selector and as a bright badge in page content. It is also repeated in the mobile navigation drawer. This makes the selected Space easy to recognize.

**Recommendation:** Keep the selector persistent. Use a compact page context line rather than a separate tall badge on every phone screen. In Statement Import and final confirmation, explicitly say `Import into Personal` and repeat it on success. Preserve Space identity in action destinations and prevent a hidden destination change during an active import.

Use brand green for navigation/primary actions consistently, with separate labeled visual treatment for warnings and over-Budget states. Green currently highlights neutral totals and explanatory privacy content, so it should not alone communicate financial health.

**Acceptance:** The User can name the destination Space at Upload, Review, and confirmation. Space context stays visible without pushing monthly decisions farther below the fold.

## Suggested delivery sequence

1. Correct the import Space badge and expense/payment language; make success and View Transactions show the saved statement; preserve sort/scroll orientation.
2. Reorder the monthly summary and Budget attention; show current Category breach amounts; add context-preserving Transaction/Budget actions; clarify Budget navigation.
3. Make unbudgeted coverage and historical-limit scope visually clear; reduce repeated caveats; improve missing-history states and filtered-result summary labels.
4. Simplify phone charts, Category selection, repeated-merchant categorization, upload steps, and filter/recovery controls.
5. Add explainable anomaly and Budget-adjustment suggestions after sufficient recorded-history handling is established.

## Remaining validation limits

- Password-entry usability and incorrect-password recovery, because the User unlocked the PDF.
- A Category nearing its Budget without yet exceeding it; actual imported data exercised over-Budget and unbudgeted states.
- Probable-duplicate review, interrupted-import recovery, and navigating away during an unfinished import.
- Physical mobile PDF picking, virtual-keyboard interaction, touch accuracy, and operating-system-specific month selection.
- A formal contrast audit and full assistive-technology testing. The review inspected visible labels and some accessible controls, not a complete accessibility conformance audit.
- The proposed improvements are design recommendations; no implementation or app regression suite was run as part of this read-only design review and authorized in-app journey.

## Screenshots

- [Mobile upload](mobile-upload.jpg)
- [Mobile Monthly Insights](mobile-monthly-insights.jpg)
- [Desktop Monthly Insights](desktop-monthly-insights.jpg)
- [Mobile Review with conflicting Space label](mobile-review.jpg)
- [Desktop Review with expense/payment terminology](desktop-review.jpg)
- [Import success](import-success.jpg)
- [Post-import Transactions defaulting to September](post-import-transactions-default.jpg)
- [June Budget attention](post-import-budget-attention.jpg)
- [Over-Budget Category under Lowest spending](post-import-lowest-spending.jpg)
- [Populated mobile Monthly Insights](post-import-mobile-monthly-insights.jpg)
- [Populated desktop Monthly Insights](post-import-desktop-monthly-insights.jpg)

Screenshots include the synthetic test harness, which occupies substantial phone height and is excluded from the product layout recommendations. Full-page captures can place fixed navigation across the captured document; that capture behavior is not itself evidence of a layout defect.
