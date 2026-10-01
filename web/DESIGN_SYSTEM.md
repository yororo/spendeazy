# Spendeazy Design System

This document is the implementation source of truth for Spendeazy UI. The Pen file at `design/ui-design.pen` remains the visual reference. When the Pen file contains accidental inconsistencies, follow the normalized rules documented here.

## Code placement

Paths in this document are relative to `web/`. Follow [web architecture](docs/ARCHITECTURE.md) for dependency direction and feature ownership, and [root CONTEXT.md](../CONTEXT.md) for domain language.

Semantic tokens live in `src/index.css`; generic accessible primitives live in `src/components/ui`. Feature-specific presentation stays in its owning `src/features/<feature>` directory. Application composition belongs in `src/components/app` and `src/layouts`; proven reusable domain UI belongs in `src/shared`. Business pages live in features, while `src/pages` holds routes such as Not Found.

## Foundations

### Color

The implemented palette reflects the colors used by the nine Pen screens. An unused orange shadcn-like palette found in the Pen file was intentionally not carried into the application.

| Token                  | Value     | Purpose                                  |
| ---------------------- | --------- | ---------------------------------------- |
| `background`           | `#FFFFFF` | Page and control background              |
| `foreground`           | `#000000` | Primary text and strong structure        |
| `card`                 | `#FFFFFF` | Card and panel surface                   |
| `primary`              | `#00FF00` | Brand fills, selected states, and charts |
| `primary-foreground`   | `#000000` | Content placed on neon green             |
| `secondary`            | `#000000` | Sidebar and inverse actions              |
| `secondary-foreground` | `#FFFFFF` | Content on black                         |
| `muted`                | `#F5F5F5` | Quiet surfaces and table headers         |
| `muted-foreground`     | `#666666` | Secondary text                           |
| `border` / `input`     | `#CCCCCC` | Dividers and form boundaries             |
| `ring`                 | `#000000` | High-contrast keyboard focus             |
| `destructive`          | `#A30000` | Errors and destructive actions           |
| `success`              | `#245A24` | Accessible positive text and borders     |
| `success-surface`      | `#F7FFF7` | Positive status background               |
| `warning`              | `#804200` | Accessible warning text and borders      |
| `warning-surface`      | `#FFF8EB` | Warning background                       |

Neon green is a brand surface color, not body text on white. Pair it with black foreground. Use the darker `success` token for positive text.

Category colors are application tokens, not generic UI states. Categories persist one of these 24 named swatches; custom values and black/white are not choices. The identifier, not its display label or position, is stored by the API. Existing records without an explicit choice resolve from their stable Category ID, so the marker does not change with a rename, sort order, or reporting period. Dashboard, Transactions, Categories, and Statement Import all use the saved or resolved Category Color for markers and breakdowns. Category edits invalidate each dependent feature query so the updated color appears wherever that Category is shown.

| Swatch  | Token              | Value     | Swatch  | Token              | Value     |
| ------- | ------------------ | --------- | ------- | ------------------ | --------- |
| Coral   | `category-coral`   | `#F97316` | Scarlet | `category-scarlet` | `#DC2626` |
| Crimson | `category-crimson` | `#E11D48` | Rose    | `category-rose`    | `#F43F5E` |
| Magenta | `category-magenta` | `#DB2777` | Orchid  | `category-orchid`  | `#C026D3` |
| Plum    | `category-plum`    | `#9333EA` | Violet  | `category-violet`  | `#7C3AED` |
| Indigo  | `category-indigo`  | `#4F46E5` | Cobalt  | `category-cobalt`  | `#2563EB` |
| Azure   | `category-azure`   | `#0369A1` | Sky     | `category-sky`     | `#0284C7` |
| Cyan    | `category-cyan`    | `#0891B2` | Teal    | `category-teal`    | `#0F766E` |
| Emerald | `category-emerald` | `#059669` | Forest  | `category-forest`  | `#15803D` |
| Lime    | `category-lime`    | `#65A30D` | Olive   | `category-olive`   | `#4D7C0F` |
| Gold    | `category-gold`    | `#CA8A04` | Amber   | `category-amber`   | `#D97706` |
| Copper  | `category-copper`  | `#B45309` | Cocoa   | `category-cocoa`   | `#92400E` |
| Slate   | `category-slate`   | `#475569` | Steel   | `category-steel`   | `#64748B` |

Legacy category-key tokens remain available for non-persisted labels such as Uncategorized. A `CategoryBadge` rendered for an API Category ID requires its resolved named swatch.

### Theme and Appearance

Theme is the browser-wide visual style: **Technical** (default) or **Playful**. Appearance independently selects Light, Dark, or System. Both use the same routes, components, query/session composition, and financial data. Category Color swatches are invariant across both dimensions. See the accepted [Independent Theme and Appearance ADR](docs/adr/0004-independent-theme-and-appearance.md).

Settings sits beside the User's name in the shared sidebar/profile composition, including the phone/tablet navigation Sheet. It starts collapsed on profile mount, announces expansion and its controlled inline section, and exposes a labelled Theme dropdown followed by the Appearance selector. The Theme dropdown displays the current choice and uses the shared Dropdown Menu's checked options, arrow-key navigation, Enter/Space selection, Escape dismissal, and focus restoration. Its compact composition accommodates future Theme choices; the current choices remain Technical and Playful. Selecting either preference leaves Settings open; Sign out remains below.

`components/app/theme.ts` owns the browser preference `spendeazy.theme`; existing `spendeazy.appearance` storage and System defaults remain compatible. Both initialize before React renders, persist across reloads/sign-outs, and synchronize storage changes across tabs. Missing, invalid, removed, or cleared Theme values resolve to Technical. Storage failures still permit current-visit selection. Preferences do not belong to a User or Space and have no server persistence. The document's `data-visual-theme` selects Theme, while the existing `data-theme` marker records resolved light/dark Appearance and native `color-scheme`.

Technical retains the palette above, Geist/Geist Mono, and square edges. Playful uses the approved Emerald and Honey treatment, with locally bundled Nunito headings/metrics and Nunito Sans body/navigation/controls/tables. Data typography remains tabular. Colors and edge/font roles change without altering text sizes, spacing, control dimensions, breakpoints, safe areas, wording, icons, logo, or component order; natural font wrapping is permitted.

**Playful has no hard UI corners.** Round every standalone surface and control, including Space labels, Space identity icons, profile initials, selected menu options, status panels, checkboxes, progress fills, charts, and overlays. Both desktop and compact/drawer compositions follow this rule in Light and Dark. Use the shared edge roles rather than leaving a new component square or adding page-specific patches. Preserve larger card/profile radii when applying the control/small-surface radius. The viewport boundary, straight dividers, and the unchanged pixel logo are structural or brand geometry, not UI surface corners; do not reshape the logo.

| Playful role | Light | Dark |
| --- | --- | --- |
| Background / foreground | `#FAF8F1` / `#172D25` | `#101E18` / `#EDF5EF` |
| Card and popover | `#FFFFFF` | `#1A2C23` |
| Primary/inverse action / foreground | `#087443` / `#FFFFFF` | `#8CE0B2` / `#10271B` |
| Sidebar | `#EFEDE3` | `#15261E` |
| Muted / muted foreground | `#EFEDE3` / `#4F6055` | `#293D31` / `#BDCFC2` |
| Border / input | `#E4E5D9` / `#D2D6C7` | `#41584A` / `#5E7866` |
| Focus / non-category chart | `#087443` / `#24A66A` | `#8CE0B2` / `#61CF98` |
| Navigation selected / foreground | `#D8F2DF` / `#087443` | `#244A35` / `#A0E8BD` |
| Honey surface / border / text | `#FFF0BB` / `#C68A16` / `#67450A` | `#43351A` / `#BC9649` / `#FFE0A0` |

Global semantic success, warning, info, destructive, focus, and overlay roles include readable light/dark Playful values in `src/index.css`. Portaled primitives inherit document tokens. `structure` resolves to Technical foreground or Playful decorative border; `control-border` uses foreground in Technical and muted foreground in Playful so unchecked checkboxes retain a contrasting boundary. `chart` is reserved for non-category series. Font roles are `ui-font`, `data-font`, and `heading-font`. Edge roles normalize controls/overlays to 12px, cards to 24px, metrics/profiles to 20px, navigation to 16px, and chart-bar tops to 6px in Playful; all resolve to square in Technical. No separate Theme components or parallel pages are needed.

Transactions, Categories, and Insights use `structure` for page dividers, chart baselines, grouped view controls, and activity timelines. The compact Transaction search uses `control-border`, preserving its strong Technical boundary. Keep foreground contrast for meaningful chart Budget guides, selected comparison boundaries, and Category Color swatch outlines; their distinction carries financial or selection meaning. Category series and swatches retain their exact saved colors. Editors, filters, status feedback, and chart inspection reuse the existing shared primitives and document-level roles, including when portaled. No separate component exceptions are required for these workflows.

Dashboard's emphasized Total spend metric uses primary surface/foreground; supporting metrics use card surface. Daily spending uses the chart role, preserving Category Colors in category breakdowns. Manage Budgets uses the restrained honey `budget-action` role. The prototype's reference colors remain design evidence, but its URL variant, floating controls, global shortcuts, forced-light scope, logo filtering, altered sizes/padding, and structural selectors are excluded from application composition.

### Appearance behavior

Appearance applies across all routes. The initial preference is System; Light and Dark override the operating system. System follows live OS appearance changes. The preference is remembered in this browser across reloads and sign-outs, and synchronized between tabs. If browser storage is unavailable, the choice lasts for the current visit.

The `Dashboard — Monthly Expenses — Dark` frame supplies the dark palette: background `#111111`, foreground `#FFFFFF`, card/popover `#1A1A1A`, secondary/muted/border/input `#2E2E2E`, and muted foreground `#B8B9B6`. Brand green stays `#00FF00` with `#111111` foreground. Navigation uses dedicated `sidebar` (`#18181B`), `sidebar-foreground` (`#FAFAFA`), and `sidebar-border` (`#FFFFFF1A`) tokens; light navigation retains black/white with a 25% white border. Focus uses white in dark mode. Native controls use the resolved color scheme.

Status colors are normalized for dark readability: destructive `#FF9999`, success `#8CDB8C` on `#182B18`, warning `#FFC078` on `#302418`, and info `#80C7FF`, with `#111111` foreground for filled status actions. Category swatches remain the same in light and dark appearance; selected and focus states use the appearance-aware foreground, background, and ring tokens.

`AppearanceSelector` is a 32px bordered icon button in the expanded inline Settings section of `PrimarySidebar`, including the mobile/tablet navigation Sheet. Its menu opens upward to stay inside the viewport and exposes Light, System, and Dark as checked radio menu items. The trigger announces the current preference. Keyboard navigation, Escape dismissal, and focus restoration use the shared Dropdown Menu. The phone tab bar retains its four navigation destinations.

### Typography

Geist and Geist Mono are bundled locally through Fontsource.

| Role        | Family     | Typical use                                    |
| ----------- | ---------- | ---------------------------------------------- |
| UI/body     | Geist      | Descriptions, merchant names, supporting prose |
| Ledger/data | Geist Mono | Navigation, labels, amounts, dates, metrics    |

Use `font-mono` and tabular numerals for financial values. Use the `text-label` utility for uppercase metadata and the `text-metric` utility for prominent amounts.

Accessibility normalization:

- Body and control text starts at 14px.
- Metadata and table text does not go below 12px.
- Default controls are 40px high; compact controls are 32px high.
- Interactive targets must not be smaller than 24px in either dimension.

The Pen source contains 8–11px text. Those sizes were treated as visual-density cues rather than literal implementation values.

### Spacing

Use Tailwind's 4px-derived spacing scale. A 2px micro-step is allowed for tightly related content. Common compositions use:

- 8px for compact groups
- 12px for control and navigation gaps
- 16px for card content
- 20–24px between page sections
- 28px vertical and 36px horizontal desktop page padding

Do not reproduce source values such as 5px, 7px, 9px, or 11px unless a new documented token is justified.

### Radius and elevation

Technical's `--radius` is `0px`; its cards, inputs, buttons, badges, and panels remain square. Playful uses the Theme edge roles above. Circular geometry is reserved for semantic shapes such as status dots.

Cards have no default shadow. Hierarchy comes from 1px borders, black inverse surfaces, and spacing. The Pen file's single green processing glow is a workflow-specific effect, not a general elevation token.

### Layout and breakpoints

- Authenticated desktop pages use a 224px (`w-56`) sidebar.
- Page content is fluid and constrained by `max-w-screen-2xl`.
- Phone layouts apply below `md` (768px), based on viewport width rather than device detection. This includes narrow desktop windows; landscape phones at or above 768px use the wider layout.
- Below `md`, authenticated pages show a fixed 64px Mobile Tab Bar with Dashboard, Imports, Transactions, and Insights links. It uses square geometry, solid semantic black/green surfaces, no shadow, 12px labels, and four equal touch targets. The mockup's rounded pill and tiny labels are not implementation rules.
- The tab bar accounts for bottom and landscape safe areas. The shell reserves its height plus the bottom safe area so page content remains reachable. Modal Sheets and Dialogs appear above it.
- The header and accessible navigation Sheet remain below `lg`, including on phones for profile and Sign out access. Tablets from 768px to 1023px use the Sheet without a tab bar. The persistent sidebar begins at `lg` (1024px).
- Dashboard phone metrics show full-width Total spend followed by four metrics in a two-column grid. Wider Dashboard layouts retain two columns, reaching five columns at `xl`.
- Dense tables retain semantic table markup and scroll horizontally when required.
- Multi-column analytical panels stack in reading order on narrow screens.

The `Dashboard — Monthly Expenses — Mobile` Pen frame guides the Dashboard phone composition: compact heading, Reporting Period control beside an accessible icon-only import action, stacked analysis panels, top four categories with a View all link, and up to five compact recent Transaction rows with a matching count and View all link. Account stays in the wider table and Transactions page. Every calendar day remains visible in the phone chart without horizontal scrolling; day labels stay sparse, and a compact left amount axis scales to the period's highest daily value. An accessible data table retains all daily values. Existing API-backed metrics and descriptions take precedence over unsupported illustrative mockup figures. Other pages retain their existing content layouts.

The Categories phone composition keeps the `Budget overview` heading, Reporting Period control, and Add Category action in a vertical hierarchy. Its summary distinguishes all spending, Budgeted Spending, Unbudgeted Spending, the monthly Budget limit, and the amount remaining in monthly Budgets. Category tools stack a full-width name search above a separate tappable inactive-visibility row. Filtered Categories use a semantic vertical list of square cards: budgeted cards read identity/status, Monthly Budget, paired Spent and Remaining, usage progress, and usage percentage; unbudgeted cards read identity/status, No monthly Budget, Spent, and Not budgeted. Descriptions remain in the wider table and are omitted from phone cards. The wider composition retains the existing semantic table at `md` and above.

The Dashboard places Budget attention before spending charts: Categories at or above 80% of their monthly Budget appear first, followed by the three highest-spend Categories without a monthly Budget. Each row links to Transactions filtered to that Category. The Budget usage metric names its scope and shows Budgeted Spending against the Budget limit; a separate metric shows Unbudgeted Spending.

Each active phone Category card keeps Edit and Matching Rules directly available, and exposes Deactivate through a labelled overflow trigger. The overflow menu is a compact action surface: it supports keyboard navigation, Escape and outside dismissal, visible focus, and trigger focus restoration. Categories owns the confirmation Dialog, status mutation, pending/error states, and fallback focus after a Category disappears; the generic menu owns only presentation and interaction. Inactive cards expose Reactivate directly so their available status action is never hidden.

## Generic UI primitives

All primitives live in `src/components/ui` and follow editable shadcn/Radix patterns.

### Button

Variants:

- `default` — neon brand action
- `secondary` — black inverse action
- `outline` — bordered neutral action
- `destructive` — destructive action
- `ghost` — quiet navigation/action

Sizes: `default`, `sm`, `lg`, `icon`, and `icon-sm`.

### Card

Variants:

- `default` — standard bordered surface
- `strong` — black structural border
- `muted` — quiet grey surface
- `inverse` — black surface
- `accent` — neon-green emphasis

Card exports Header, Title, Description, Content, and Footer composition parts.

### Badge

Variants: `default`, `secondary`, `outline`, `muted`, `success`, and `destructive`.

Category identity does not belong in Badge variants. Use the application-level `CategoryBadge` module.

### Forms and feedback

- Input
- DateInput — a native date input wrapper that keeps the control contained and adds a visible picker affordance on coarse-pointer devices.
- Textarea
- Label
- Select
- Checkbox
- Progress
- Alert (`default`, `warning`, `destructive`)

### Structured interaction

- Table and its semantic composition parts
- Sheet for narrow-screen navigation and future edge panels
- Dialog for modal workflows. It uses Radix focus trapping, Escape-to-close,
  outside-interaction handling, accessible title/description wiring, and
  focus restoration to its trigger.
- Dropdown Menu for compact action groups. It provides an accessible trigger,
  menu, and menu items with arrow-key navigation, Enter/Space activation,
  Escape and outside dismissal, visible focus, and focus restoration to the
  trigger. Domain labels, mutation behavior, and confirmation decisions stay
  with the feature that composes it.

Tabs, popovers, switches, toasts, tooltips, and other catalog items have not been added because current designs do not demonstrate a need for them. The Categories feature uses a feature-scoped native radio group for its fixed named color choices rather than adding a generic radio-group primitive.

### Category color picker

`CategoryColorPicker` is scoped to category create/edit forms. Both forms show the current swatch and name in a compact Select; its options show all 24 named swatches. The Select closes after a choice or outside interaction and keeps its standard keyboard behavior. The selected-color text and high-contrast focus ring remain visible. The same color can be chosen for multiple categories; colors do not imply unique category identity.

## Application modules

Place these components by ownership, following architecture: navigation and product identity belong to application composition; Dashboard-only metrics and charts belong to Dashboard; domain UI with proven cross-feature use belongs in `src/shared`. Examples:

- `LedgerMark` — product identity
- `PrimarySidebar` — authenticated navigation and profile summary
- `MobileTabBar` — phone-only authenticated navigation, sharing route definitions with `PrimarySidebar`
- `MetricCard` — Dashboard KPI presentation
- `SpendingChart` — replaceable spending visualization
- `CategoryBadge` — category identity mapped to application tokens
- `CategoryBreakdown` — category-share visualization
- `TransactionTable` — transaction-specific table composition
- `ReportingPeriodFilter` — shared native month control for period-scoped financial views

`AppShell` lives in `src/layouts` because it controls page structure and responsive navigation.

`SpaceSwitcher` persistently appears above primary navigation in `PrimarySidebar` and directly in the compact mobile header. It lists every authorized active Space with only a "Personal" or "Shared" label, plus semantic single-person or multiple-person icons; it preserves the current page and other URL parameters while changing the active Space, and navigation guards still apply. The same switcher appears in the narrow-screen navigation Sheet. Each Dashboard, Transactions, Categories, and Statement Import stage places a compact, non-interactive Personal or Shared label above its title.

Space labels resolve from the accessible Space's actual kind, including explicit Personal Space IDs. An unresolved explicit ID displays neutral `Space` text instead of guessing Shared. Application composition supplies the accessible identities; Statement Import keeps its accepted destination ID for Categorize, Review, success, and commit even if the route changes.

The sidebar and navigation Sheet call the existing `/categories` destination **Budgets**. It retains Budget overview, Add Category, editing, Matching Rules, and Category lifecycle management. The four phone tabs remain Dashboard, Imports, Transactions, and Insights. Dashboard's Budget attention and Monthly Insights' current Budget summary expose **Manage Budgets** through keyboard-accessible buttons. These actions retain the selected Space and shared Reporting Period and use the existing Budget overview route. Daily Insights retains its own chart controls.

Statement Import completion scrolls to and focuses the confirmation heading, with an announced destination, saved expense count, and total. View Transactions carries the destination Space and Committed Statement Import identity. In statement scope, a visible statement context and Return to monthly view action replace the month picker. Recorded expense activity dates and complete filtered count/total span all statement months; additional filters only narrow this scope. Activity dates do not establish complete statement or Space coverage. Returning clears narrowing filters and restores the unchanged prior Reporting Period. Loading, failure, and empty states retain statement context and recovery actions.

The supplemental [statement browsing reference](design/statement-transactions.pen) records the completion and statement-view compositions; the existing main Pen reference remains the source for shared components and tokens.

### SpendingChart interface

Dashboard callers provide typed spending points, labels, and an accessible summary. Bar height calculation and CSS rendering stay inside the module. A future SVG or chart-library implementation should preserve this interface unless the domain itself changes.

```tsx
<SpendingChart
  points={spendingPoints}
  title="Daily spending"
  currentLabel="August"
  summary="Daily expenses recorded for the selected month."
/>
```

## Development rules

1. Search `src/components/ui` before creating a generic primitive.
2. Search the owning feature and existing shared domain UI before creating a Spendeazy-specific module.
3. Use semantic color tokens instead of literals in JSX.
4. Use the established spacing and Theme edge roles instead of arbitrary measurements.
5. Keep page-specific data and business behavior out of generic primitives.
6. Add a meaningful variant when an existing module needs a reusable visual choice.
7. Keep a module's interface smaller than its implementation; hide rendering detail from callers.
8. Use the established typography roles instead of styling each text node independently.
9. Preserve semantic HTML, keyboard behavior, focus visibility, and responsive reading order.
10. Update this document when a genuinely reusable token, variant, primitive, or application pattern is introduced.

Correct:

```tsx
<Card variant="strong">
  <CardHeader>
    <CardTitle>Recent transactions</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

Incorrect:

```tsx
<div className="rounded-[13px] border-[#dedede] p-[19px] shadow-[0_3px_8px_#0002]">
  ...
</div>
```

Correct application composition:

```tsx
<CategoryBadge category="housing">Housing</CategoryBadge>
```

Incorrect generic coupling:

```tsx
<Badge housingColor budgetAmount={1450}>
  Housing
</Badge>
```

## Source inconsistencies and decisions

The integrated spending journey uses the detailed references linked below:
`statement-categorization.pen` for assignment/Remember, `statement-transactions.pen`
for committed-statement scope, `monthly-insights.pen` for monitoring and return
actions, and `chart-inspection.pen` for accessible details. These refine the
original overview frames in `ui-design.pen`; its Review frames retain read-only
grouping and expense language. Follow this document's four-tab phone navigation,
semantic tokens, exact Budget states, and viewport rules across all references.

| Source inconsistency                                                   | Implemented decision                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Two overlapping Dashboard frames                                       | Use the version headed “Your spending at a glance,” including Budget Used                                                       |
| Active neon-green palette and unused orange semantic palette           | Map the active black/white/neon system into semantic tokens; discard orange residue                                             |
| Earlier unused dark variables versus the verified dark Dashboard frame | Use the dark Dashboard palette with Light, System, and Dark appearance selection                                                |
| Many 1–2px spacing differences                                         | Normalize to the spacing scale                                                                                                  |
| 8–11px interface text                                                  | Raise sizes for accessibility                                                                                                   |
| Geist Mono and IBM Plex Mono overlap                                   | Consolidate data and labels onto Geist Mono                                                                                     |
| Neon green used as text on white                                       | Reserve neon for surfaces/indicators; use dark success text                                                                     |
| Desktop frames and a 390px mobile Dashboard reference                  | Apply the viewport-based responsive rules documented above; the design system takes precedence over illustrative mockup styling |
| Floating-point artifacts in category amounts                           | Treat them as source-data defects; format currency values at the data boundary                                                  |
| “Map” and “Confirm” workflow naming                                    | Use Statement Import: Upload → Categorize → Review, as defined in root `CONTEXT.md`                                                  |

## Adding a new pattern

Monthly Insights leads with the selected Reporting Period, Total recorded spending, Budgeted Spending, and Unbudgeted Spending before 12-month totals and charts. Category attention exposes Nearing Budget, At Budget Limit, and Over Budget independently of aggregate usage; lowest-spending rankings also show exact Budget descriptions. Current-month recorded usage and elapsed calendar-month progress appear together without forecasts. Historical spending uses current monthly limits. Category markers retain saved colors.

View Transactions carries the selected Space, month, and Category. Return to Insights restores the originating Reporting Period, scroll, and action focus. Edit Budget and Set Budget open the existing Category editor in a focus-trapped dialog over Insights; save/cancel restores the originating action while successful saves refresh dependent queries. Budget help explains that changed recurring limits also affect historical comparisons. Empty and no-monthly-Budget states offer Transactions and Manage Budgets without claiming complete spending coverage. See [Monthly Insights reference](design/monthly-insights.pen).

Monthly Budget presentations classify exact cents before rounding display values: below 80% is Within Budget, 80% to below 100% is Nearing Budget, exactly 100% is At Budget Limit, and above 100% is Over Budget. Show precise remaining or over amounts beside rounded usage. Aggregate comparisons use Budgeted Spending against current monthly limits; total recorded spending and Unbudgeted Spending remain separate. Show setup guidance when monthly limits are absent and describe zero activity as no spending recorded, without implying complete monthly coverage.

Monthly Insights shows Potential spending patterns after selected-month attention and before historical charts. Native disclosure controls expose each Category’s selected amount, six preceding calendar months, equivalent-day or full-month cutoffs, positive contributing months, exact median (including half cents), changes, and contributing Transactions. Insufficient recorded history and no-signal states avoid completeness or normal-spending claims. Investigation actions carry Category, Space, and month; returning reopens evidence disclosures and restores focus. Comparison actions explicitly open the full month’s Transactions. See the evidence frame in [Monthly Insights reference](design/monthly-insights.pen).

Before adding UI, classify it in this order:

1. Existing token
2. Existing primitive or variant
3. Existing application module
4. Existing layout
5. New reusable pattern

If a Pen screen appears to need a new value, determine whether it represents a real reusable decision or an accidental one-screen difference. Prefer a new intentional variant over changing a shared primitive for one caller.

Statement Import Categorize opens a compact phone Category editor from the Category action, displaying the full description, date, and amount. Full corrections expands the existing form without discarding entered values. Category selection and Suggestions update only the draft. Apply & next explicitly saves, then focuses the next included Unmapped expense in the selected visible order using parsed-row identity, skipping assigned and excluded rows and wrapping to earlier remaining rows. Filters remain active; completion distinguishes the visible result from the complete statement and leaves Review as an explicit action. Failed saves retain the editor and corrections. Eligible expense exclusion remains reversible. The wider table retains full editing and adds the same Apply & next action. See [categorization reference](design/statement-categorization.pen).

Categorize repeats opens a scrollable, focus-trapped Dialog on phones and desktop. It previews rows sharing the normalized full description in the current statement, retaining punctuation. Included Unmapped expenses are selected initially; assigned expenses require explicit selection for replacement, and excluded rows are visible with disabled selection. The selected count and Category are confirmed through Apply; an empty selection disables Apply. Bulk assignment changes only Categories, records Manual assignments, and creates no Category Rule. Closing returns focus to the originating row action.

Remember remains an explicit unchecked opt-in in both Category editors. Explain future-import benefits unless an equivalent Rule already exists. Exact is the default and uses the complete description; Contains is an explicit substring choice with punctuation retained and Exact precedence explained. Show current-statement matching descriptions with excluded/reviewed states. Apply & remember saves the Rule before assigning the draft; announce persistence separately from import confirmation. Failure or conflict retains inputs and offers Retry and Apply without remembering. Explain uncertain completion, equivalent-Rule reuse, and that saved Rules survive draft discard. See the Remember and recovery frames in [categorization reference](design/statement-categorization.pen).

Statement Import Review is read-only. It shows every included expense first, in the Categorize sort order, followed by an expandable Excluded rows section in that same order. Categorize filters do not hide Review rows. Both Categorize and Review display expense amounts as positive magnitudes; Review labels them Expense; provider-identified card payments and other credits explain why they are excluded. User-excluded expenses say Excluded by you. A compact sticky included expense count and total sits below the fixed app header and above the scrolling content, leaving confirmation and mobile navigation reachable. One Back to Categorize action restores search, Category/date filters, sort, scroll position, and focus to Review. Corrections and Remember stay in Categorize. The Review frames in [ui-design.pen](design/ui-design.pen) show this grouping and language.

Recurring Budget review shows the last six eligible completed recorded Category months, skipping empty months and reaching beyond the chart window when needed. At least three strict breaches of the current monthly limit suggest review. Evidence shows the actual denominator, month amounts, and current limit inside the existing editor; the User explicitly saves any change. Historical selections include the selected completed month; current and future selections stop before the current month. Unbudgeted history offers Set Budget and preserves yearly limits.


### Chart selection and inspection

Insights comparison defaults to the three highest-spending available Categories across the displayed range, or every available Category when fewer exist. A compact native disclosure opens the selection controls. Saved Category Colors remain stable; labeled line samples distinguish shared colors with solid/dashed patterns. Sparse axis labels use month and year, with full readable period buttons in a horizontally scrolling strip below the chart.

Tapping bars or trend points, activating period buttons, or using the labeled point selector opens the same scrollable, focus-trapped spending Dialog. It shows recorded totals, Category contributions, full-month states against current Budgets, contributing Transactions, and contextual actions independently of potential-pattern history. Inspection preserves Reporting Period; View this month changes it explicitly. Full-month Transaction actions carry the inspected month, Category, and Space. Dismissal restores the originating chart control. Dialogs sit above the tab bar and keep actions inside the scrollable viewport. See [chart inspection reference](design/chart-inspection.pen).
