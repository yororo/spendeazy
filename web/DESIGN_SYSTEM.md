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

### Appearance

Appearance applies across all routes. The initial preference is System; Light and Dark override the operating system. System follows live OS appearance changes. The preference is remembered in this browser across reloads and sign-outs, and synchronized between tabs. If browser storage is unavailable, the choice lasts for the current visit.

The `Dashboard — Monthly Expenses — Dark` frame supplies the dark palette: background `#111111`, foreground `#FFFFFF`, card/popover `#1A1A1A`, secondary/muted/border/input `#2E2E2E`, and muted foreground `#B8B9B6`. Brand green stays `#00FF00` with `#111111` foreground. Navigation uses dedicated `sidebar` (`#18181B`), `sidebar-foreground` (`#FAFAFA`), and `sidebar-border` (`#FFFFFF1A`) tokens; light navigation retains black/white with a 25% white border. Focus uses white in dark mode. Native controls use the resolved color scheme.

Status colors are normalized for dark readability: destructive `#FF9999`, success `#8CDB8C` on `#182B18`, warning `#FFC078` on `#302418`, and info `#80C7FF`, with `#111111` foreground for filled status actions. Category swatches remain the same in light and dark appearance; selected and focus states use the appearance-aware foreground, background, and ring tokens.

`AppearanceSelector` is a 32px bordered icon button beside Sign out in `PrimarySidebar`, including the mobile/tablet navigation Sheet. Its menu opens upward to stay inside the viewport and exposes Light, System, and Dark as checked radio menu items. The trigger announces the current preference. Keyboard navigation, Escape dismissal, and focus restoration use the shared Dropdown Menu. The phone tab bar retains its four navigation destinations.

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

`--radius` is `0px`. Cards, inputs, buttons, badges, and panels are intentionally square. Circular geometry is reserved for semantic shapes such as status dots.

Cards have no default shadow. Hierarchy comes from 1px borders, black inverse surfaces, and spacing. The Pen file's single green processing glow is a workflow-specific effect, not a general elevation token.

### Layout and breakpoints

- Authenticated desktop pages use a 224px (`w-56`) sidebar.
- Page content is fluid and constrained by `max-w-screen-2xl`.
- Phone layouts apply below `md` (768px), based on viewport width rather than device detection. This includes narrow desktop windows; landscape phones at or above 768px use the wider layout.
- Below `md`, authenticated pages show a fixed 64px Mobile Tab Bar with Dashboard, Imports, Transactions, and Categories links. It uses square geometry, solid semantic black/green surfaces, no shadow, 12px labels, and four equal touch targets. The mockup's rounded pill and tiny labels are not implementation rules.
- The tab bar accounts for bottom and landscape safe areas. The shell reserves its height plus the bottom safe area so page content remains reachable. Modal Sheets and Dialogs appear above it.
- The header and accessible navigation Sheet remain below `lg`, including on phones for profile and Sign out access. Tablets from 768px to 1023px use the Sheet without a tab bar. The persistent sidebar begins at `lg` (1024px).
- Dashboard phone metrics show full-width Total spend followed by four metrics in a two-column grid. Wider Dashboard layouts retain two columns, reaching five columns at `xl`.
- Dense tables retain semantic table markup and scroll horizontally when required.
- Multi-column analytical panels stack in reading order on narrow screens.

The `Dashboard — Monthly Expenses — Mobile` Pen frame guides the Dashboard phone composition: compact heading, Reporting Period control beside an accessible icon-only import action, stacked analysis panels, top four categories with a View all link, and up to five compact recent Transaction rows with a matching count and View all link. Account stays in the wider table and Transactions page. Every calendar day remains in the phone chart; sparse axis labels avoid horizontal scrolling, and an accessible data table retains all daily values. Existing API-backed metrics and descriptions take precedence over unsupported illustrative mockup figures. Other pages retain their existing content layouts.

The Categories phone composition keeps the `Budget overview` heading, Reporting Period control, and Add Category action in a vertical hierarchy. Its summary presents Total monthly Budget full-width, Spent and Remaining as a paired row, and Categories in a shorter full-width card. Category tools stack a full-width name search above a separate tappable inactive-visibility row. Filtered Categories use a semantic vertical list of square cards: budgeted cards read identity/status, Monthly Budget, paired Spent and Remaining, usage progress, and usage percentage; unbudgeted cards read identity/status, No monthly Budget, Spent, and Not budgeted. Descriptions remain in the wider table and are omitted from phone cards. The wider composition retains the existing semantic table at `md` and above.

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

`SpaceSwitcher` persistently appears above primary navigation in `PrimarySidebar` and directly in the compact mobile header. It lists every authorized active Space with explicit Personal or Shared labels, member names, and semantic single-person or multiple-person icons; it preserves the current page and other URL parameters while changing the active Space, and navigation guards still apply. The same switcher appears in the narrow-screen navigation Sheet. Each Dashboard, Transactions, Categories, and Statement Import stage places a compact, non-interactive Personal or Shared label above its title.

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
4. Use the established spacing and square-radius rules instead of arbitrary measurements.
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

Before adding UI, classify it in this order:

1. Existing token
2. Existing primitive or variant
3. Existing application module
4. Existing layout
5. New reusable pattern

If a Pen screen appears to need a new value, determine whether it represents a real reusable decision or an accidental one-screen difference. Prefer a new intentional variant over changing a shared primitive for one caller.
