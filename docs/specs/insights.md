# Insights

## Problem Statement

Users can see current spending and Budget usage on the Dashboard, but cannot readily see how spending changes across days or months, which Categories repeatedly exceed their monthly Budgets, or which budgeted Categories have unusually low spending. They need these patterns in their current Space to make informed Budget and spending decisions.

## Solution

Add an authenticated Insights page using the desktop and mobile Insights frames in the Pen design and the application's design system. A selected calendar month anchors two views: Monthly shows daily data for that month; Yearly shows that month and the preceding 11 months. Both views show stacked total spending by Category and a filterable Category spending line chart. Monthly additionally shows the five Categories most often over their monthly Budget in the 12-month window and the five active monthly-budgeted Categories with the lowest spending in the selected month. Budget references are optional chart overlays. Every Budget comparison explicitly uses Budgeted Spending and current Budgets.

## User Stories

1. As a User, I want to open Insights from the authenticated navigation, so that I can examine spending patterns in my selected Space.
2. As a User, I want Insights to retain the selected Space, so that Personal and Shared financial data remain separate.
3. As a User, I want to switch between Monthly and Yearly views, so that I can inspect daily detail and longer trends.
4. As a User, I want to choose a calendar month, so that I can examine a past Reporting Period.
5. As a User, I want the Yearly view to end at my selected month and include the previous 11 months, so that its 12 points have a predictable meaning.
6. As a User, I want the Monthly view to show every day of the selected month, including days with no spending, so that gaps and spikes are visible.
7. As a User, I want the Yearly view to show every month in its rolling window, including months with no spending, so that the timeline is continuous.
8. As a User, I want spending bars divided by Category Color, so that I can recognize the Categories contributing to each total.
9. As a User, I want unbudgeted and Uncategorized spending included in total spending, so that the chart accounts for all Transactions.
10. As a User, I want a separate, clearly labelled Budgeted Spending comparison, so that I do not mistake the monthly Budget total for a limit on all spending.
11. As a User, I want to toggle the dashed Budget reference on the spending chart, so that I can focus on spending alone or compare it with my Budget.
12. As a User, I want the Yearly reference to represent the sum of current monthly Budgets, so that I can spot months whose Budgeted Spending exceeded that amount.
13. As a User, I want the Monthly reference to represent daily Budget pace, calculated from the selected month's number of days, so that I can see days above the planned pace without treating that pace as a hard daily limit.
14. As a User, I want the Category line chart to show daily or monthly spending in the active view, so that I can see how individual Categories change over time.
15. As a User, I want to select which Categories appear in the line chart, so that overlapping lines remain understandable.
16. As a User, I want to toggle dashed Category Budget references, so that I can compare selected Categories with their current monthly Budgets or daily Budget pace.
17. As a User, I want Categories without a monthly Budget to remain inspectable in the line chart without a Budget reference, so that their spending remains visible.
18. As a User, I want to see up to five Categories ranked by the number of months they exceeded their monthly Budget in the rolling 12-month window, so that I can identify repeated breaches.
19. As a User, I want the breach count and comparison period shown, so that I can interpret the ranking correctly.
20. As a User, I want to see up to five active monthly-budgeted Categories with the least spending in the selected month, including zero spending, so that I can reconsider their Budgets or retain effective habits.
21. As a User, I want low-spending entries to show spending alongside their Budget, so that I can judge their usage in context.
22. As a User, I want historical comparisons labelled as using current Budgets, so that I understand they do not reconstruct past Budget amounts.
23. As a User, I want clear loading, empty, and error states, so that missing data is not mistaken for zero spending.
24. As a mobile User, I want the charts, filters, rankings, and navigation to fit a narrow screen, so that Insights remains usable on my phone.
25. As a keyboard or screen-reader User, I want accessible controls and equivalent chart values, so that I can use Insights without relying on color or pointer interactions.

## Implementation Decisions

- Build Insights as a web feature with a route, authenticated navigation entry, feature-owned query, read model, aggregation, and presentation. Use the established shared reporting-period, Category Color, money, Space, and API transport modules. Follow the four Insights Pen frames, normalizing typography, spacing, and accessibility through the design system.
- The selected calendar month is shared by Monthly and Yearly. Yearly consists of exactly 12 months, including the selected month. Monthly includes all calendar days of the selected month. Period selection and view selection do not change the active Space.
- Obtain authorized Transactions and Categories through the existing API contracts. Page through Transactions as needed for the rolling window. Aggregate exact cents by date and Category; map Category identity and Color through the existing Category catalog. Include Inactive Categories when they have historical Transactions and include Uncategorized Transactions in total spending.
- Stacked bars represent all spending. Budget overlays and breach indicators compare only Budgeted Spending with the sum of current monthly Category Budgets. Label those scopes separately in summaries and accessible chart data. Unbudgeted and Uncategorized amounts never count toward a Budget breach.
- The Yearly total Budget line uses the sum of current monthly Budgets for each month. The Monthly total pace line uses that sum divided by the number of calendar days in the selected month. The Category line chart uses each selected Category's current monthly Budget in Yearly and its Budget divided by the selected month's days in Monthly. The daily references are pace guides, not daily limits.
- Line chart Category filtering uses explicit Category identity; Category Colors are visual identifiers and may be shared. Categories lacking a monthly Budget have no dashed reference. Show a legible empty chart state if no Categories are selected.
- Rank monthly-budgeted Categories by the number of months in the rolling window where that Category's spending strictly exceeded its current monthly Budget. Show only Categories with at least one breach, up to five. The selected month may count once it has already exceeded the Budget. State that current Budgets are used for historical comparisons.
- Rank active Categories with a current monthly Budget by ascending spending in the selected month, including zero. Show up to five. Use stable Category name/identity tie-breaks so ranking does not jump unpredictably.
- The page adapts to the Pen's desktop and mobile compositions. Do not force dense chart labels or controls below readable sizes. Give chart values a nonvisual equivalent, with each period and Category amount accessible in a semantic table or comparable structure; use labels and patterns in addition to Color.
- No Budget-history schema or new API contract is required for this spec. If existing pagination proves insufficient, keep any new read endpoint scoped to an authenticated Space and document its contract in the canonical API specification.

## Testing Decisions

- Tests assert externally visible financial behavior and interaction, not SVG paths, CSS classes, or private aggregation steps.
- The principal seam is the Insights page rendered with controlled API responses: verify period/view switching, totals and Budget labels, Category filtering, ranking, empty/error states, Space isolation, and mobile-reachable controls. Follow existing Dashboard and Categories page tests.
- Focused tests at the feature read-model/service seam cover exact-cents aggregation, leap years and differing month lengths, zero periods, Category identity and Colors, Uncategorized and Inactive Category history, strict breach boundaries, current-Budget historical comparisons, and deterministic ranking. Follow existing Dashboard service tests.
- Route/navigation tests verify authenticated access and Space switching. The repository's required web lint, build, and tests plus the root isolated browser/API/PostgreSQL `--e2e` suite must pass for implementation.

## Out of Scope

- Reconstructing historical Budget values or adding Budget change history.
- Editing Budgets or recategorizing Transactions from Insights.
- Forecasting, recommendations, notifications, or automatic Budget changes.
- Annual-Budget comparisons; this feature's references use current monthly Budgets.
- A new shared charting design system or a duplicate web-side OpenAPI specification.

## Further Notes

- The Yearly Pen frame illustrates a January–December calendar year; the agreed behavior is a rolling 12 months ending in the selected month.
- The Pen mockups contain illustrative spending figures and explanatory snippets. Live values and descriptions must come from actual Space data; do not hard-code mockup numbers or imply causal explanations that the data cannot support.
- The API currently stores one mutable Budget per Category. Applying that Budget to earlier months is a deliberate product rule for this version and must be visible to the User.
