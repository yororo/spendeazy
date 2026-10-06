# UI components and composition

Part of the [Spendeazy design system](../../DESIGN_SYSTEM.md). Code paths are relative to `web/`; Markdown links are relative to this file.

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

Use [web architecture](../ARCHITECTURE.md#placement) for component ownership and placement. Existing presentation modules include:

- `LedgerMark` — product identity
- `PrimarySidebar` — authenticated navigation and profile summary
- `MobileTabBar` — phone-only authenticated navigation, sharing route definitions with `PrimarySidebar`
- `MetricCard` — Dashboard KPI presentation
- `SpendingChart` — replaceable spending visualization
- `CategoryBadge` — category identity mapped to application tokens
- `CategoryBreakdown` — category-share visualization
- `TransactionTable` — transaction-specific table composition
- `ReportingPeriodFilter` — shared native month control for period-scoped financial views

`SpaceSwitcher` persistently appears above primary navigation in `PrimarySidebar` and directly in the compact mobile header. It lists every authorized active Space with only a "Personal" or "Shared" label, plus semantic single-person or multiple-person icons; it preserves the current page and other URL parameters while changing the active Space, and navigation guards still apply. The same switcher appears in the narrow-screen navigation Sheet. Each Dashboard, Transactions, Categories, and Statement Import stage places a compact, non-interactive Personal or Shared label above its title.

Space labels resolve from the accessible Space's actual kind, including explicit Personal Space IDs. An unresolved explicit ID displays neutral `Space` text instead of guessing Shared. Application composition supplies the accessible identities; Statement Import keeps its accepted destination ID for Categorize, Review, success, and commit even if the route changes.

The sidebar and navigation Sheet call the existing `/categories` destination **Budgets**. It retains Budget overview, Add Category, editing, Matching Rules, and Category lifecycle management. The four phone tabs remain Dashboard, Imports, Transactions, and Insights. Dashboard's Budget attention and Monthly Insights' current Budget summary expose **Manage Budgets** through keyboard-accessible buttons. These actions retain the selected Space and shared Reporting Period and use the existing Budget overview route. Daily Insights retains its own chart controls.

Statement Import completion scrolls to and focuses the confirmation heading, with an announced destination, saved expense count, and total. View Transactions carries the destination Space and Committed Statement Import identity. In statement scope, a visible statement context and Return to monthly view action replace the month picker. Recorded expense activity dates and complete filtered count/total span all statement months; additional filters only narrow this scope. Activity dates do not establish complete statement or Space coverage. Returning clears narrowing filters and restores the unchanged prior Reporting Period. Loading, failure, and empty states retain statement context and recovery actions.

The supplemental [statement browsing reference](../../design/statement-transactions.pen) records the completion and statement-view compositions; the existing main Pen reference remains the source for shared components and tokens.

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

### Public pages and session transitions

Public sign-in and legal brand surfaces, authentication/SSO loading, and account preparation reuse the global Theme and Appearance roles. On secondary surfaces, use `secondary-foreground` for text and `inverse-accent` for selected links, hover emphasis, and activity indicators. Never pair `primary` text with `secondary`: those surfaces share emerald in Playful. `inverse-supporting` and `inverse-subtle` preserve Technical's existing 70%/50% white treatment and use opaque secondary foreground in Playful for readable supporting copy in both appearances. Structural public borders use `structure`; fonts and edges follow the same global roles as authenticated pages.

Preferences initialize before React in both production and synthetic entrypoints and remain outside the session-scoped query provider. Public routes need no preference selector. Signing out or switching Users preserves browser preferences while session-keyed financial caches retain their existing isolation. Credential-free acceptance covers legal routes and synthetic session transitions; Clerk sign-in and SSO behavior are verified separately at their existing mocked composition boundary.

## Composition examples

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
