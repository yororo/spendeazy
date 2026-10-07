# Design foundations

Part of the [Spendeazy design system](../../DESIGN_SYSTEM.md). Code paths are relative to `web/`; Markdown links are relative to this file.

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

Theme is the browser-wide visual style: **Technical** (default) or **Playful**. Appearance independently selects Light, Dark, or System. Both use the same routes, components, query/session composition, and financial data. Category Color swatches are invariant across both dimensions. See the accepted [Independent Theme and Appearance ADR](../adr/0004-independent-theme-and-appearance.md).

Theme and Appearance changes preserve current phone-window and desktop-pane scroll positions through font loading and delayed browser anchoring. The next interaction releases restoration suppression; subsequent intentional scrolling is retained. [Architecture](../ARCHITECTURE.md#composition-and-scroll-restoration) owns the shared operation and shell integration.

Settings sits beside the User's name in the shared sidebar/profile composition, including the phone/tablet navigation Sheet. It starts collapsed on profile mount, announces expansion and its controlled inline section, and exposes a labelled Theme dropdown followed by the Appearance selector. The Theme dropdown displays the current choice and uses the shared Dropdown Menu's checked options, arrow-key navigation, Enter/Space selection, Escape dismissal, and focus restoration. Its compact composition accommodates future Theme choices; the current choices remain Technical and Playful. Selecting either preference leaves Settings open; Sign out remains below.

`components/app/theme.ts` owns the browser preference `spendeazy.theme`; existing `spendeazy.appearance` storage and System defaults remain compatible. Both initialize before React renders, persist across reloads/sign-outs, and synchronize storage changes across tabs. Missing, invalid, removed, or cleared Theme values resolve to Technical. Storage failures still permit current-visit selection. Preferences do not belong to a User or Space and have no server persistence. The document's `data-visual-theme` selects Theme, while the existing `data-theme` marker records resolved light/dark Appearance and native `color-scheme`.

Technical retains the palette above, Geist/Geist Mono, and square edges. Playful uses the approved Emerald and Honey treatment, with locally bundled Nunito headings/metrics and Nunito Sans body/navigation/controls/tables. Data typography remains tabular. Colors and edge/font roles change without altering text sizes, spacing, control dimensions, breakpoints, safe areas, wording, icons, or component order; natural font wrapping is permitted.

**Playful has no hard UI corners.** Round every standalone surface and control, including Space labels, Space identity icons, profile initials, selected menu options, status panels, checkboxes, progress fills, charts, and overlays. Both desktop and compact/drawer compositions follow this rule in Light and Dark. Use the shared edge roles rather than leaving a new component square or adding page-specific patches. Preserve larger card/profile radii when applying the control/small-surface radius. The viewport boundary and straight dividers are structural geometry. Technical uses the pixel logo; Playful uses the rounded emerald and cream “Spendeazy Site Logo — Playful — Emerald & Honey” from `design/ui-design.pen`, preserving its geometry and colors in both Appearances. The shared `LedgerMark` switches the logo with the document Theme marker.

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

Statement Import, Sharing, and archived history use `structure` for workflow panels and dividers. `inverse-accent` identifies emphasized totals and icons on secondary surfaces: Technical retains neon primary accents, while Playful uses secondary foreground so emerald surfaces never hide emerald content. `inverse-muted` keeps supporting copy readable on those surfaces, including Technical Dark. `upload-action` preserves Technical's existing dark Upload button surface and gives Playful a secondary action surface. Form boundaries and focus retain the input/control and ring roles. Upload, password entry, Categorize editors, bulk assignment, Review, confirmation, invitation forms, and archived activity dialogs reuse their existing components and document-level tokens. Theme changes preserve draft state, selections, exclusions, review context, and read-only permissions; they perform no financial action.

Transactions, Categories, and Insights use `structure` for page dividers, chart baselines, grouped view controls, and activity timelines. The compact Transaction search uses `control-border`, preserving its strong Technical boundary. Keep foreground contrast for meaningful chart Budget guides, selected comparison boundaries, and Category Color swatch outlines; their distinction carries financial or selection meaning. Category series and swatches retain their exact saved colors. Editors, filters, status feedback, and chart inspection reuse the existing shared primitives and document-level roles, including when portaled. No separate component exceptions are required for these workflows.

Dashboard's Total spend and Spending vs Budget metrics use the primary surface/foreground in equal columns above the supporting metrics, stacking in that order below md. Daily spending stacks saved Category Colors, with muted foreground for Uncategorized, and exposes totals on hover, click, and keyboard focus. Category attention help sits beside its title; Manage Budgets appears as a restrained header action only when Categories need attention. The prototype's reference colors remain design evidence, but its URL variant, floating controls, global shortcuts, forced-light scope, logo filtering, altered sizes/padding, and structural selectors are excluded from application composition.

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
- Dashboard phone metrics show full-width Total spend followed by full-width Spending vs Budget, then four supporting metrics in a two-column grid. Wider layouts pair the emphasized metrics equally, with supporting metrics reaching four columns at `xl`.
- Dense tables retain semantic table markup and scroll horizontally when required.
- Multi-column analytical panels stack in reading order on narrow screens.
