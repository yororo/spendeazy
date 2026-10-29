# Mobile design-token reference

Use this document when implementing or reviewing mobile colors, typography, spacing, shapes, icons, surfaces, navigation, or dialogs.

## Source and authority

Source: [`mobile-design.pen`](mobile-design.pen). The confirmed source contains light screens and unthemed variables. Dark values in this document are implementation adaptations, not a dark design board.

**Declared** light tokens below exist in the source `variables` object; dark values are adaptations. **Derived** names are conventions introduced here for repeated literal values or component recipes; they are not existing Pencil variables or runtime exports. Node IDs are lookup keys in the source JSON. When the design changes, update the affected table and its evidence together. Resolve conflicts against the current source node, and record intentional departures rather than silently choosing another value.

[`src/constants/theme.ts`](../src/constants/theme.ts) implements the declared colors, Outfit families, page/section/button sizes, and shared spacing, radius, and control sizes. Navigation uses the source translucent fill and white glass border; Add uses the three-stop violet gradient with explicit stop opacity. The shared canvas paints the light wash and a dark adaptation behind the viewport; Expenses uses the same background behind its virtualized list.

## Implemented source map

Node references below were resolved through Pencil on 2026-10-29. This establishes source correspondence, not rendered native acceptance. The [visual handoff](../../implementation-plan.md) contains the pending manual checklist.

| Source nodes | Implementation owner and treatment |
| --- | --- |
| `FInDV`, `MONtk`, `VvvB3` | `CanvasBackground` in `components/design-surface.tsx`; viewport wash, native safe areas and scrolling via `Screen` |
| `oV7Mn` | `ScreenHeader`; exact transparent logo export in `assets/design/oV7Mn.png`, 4× the source 30 × 34 |
| `MONtk`, `VvvB3`, `ur6VR`, `oMcp7`, `BfC6x` | `features/dashboard/dashboard-view.tsx` and `dashboard-charts.tsx`; period controls, summary, checks, monthly bars and Category series |
| `jaqBA`, `W8UYh6`, `QtZkz` | Yearly selector and About this summary sheet; exact inclusive Manila dates, YTD/In progress and current configuration basis |
| `sJKV1`, `oUFRH`, `aXuG0`, `rNiyc`/`UYKIg`, `u91Za`/`SYiAK` | Summary and annual allocation/excess meters; completed-month aggregate frequency; separate Expenses and configuration actions |
| `U0W2qG`, `bqcvI`, `ppce3` | Chart cards and searchable Category multiselect; three chips plus `+N`, stable ID markers, native month detail sheets |
| `Qd5CZ` | `features/expenses/browse-view.tsx`; centered total, toolbar, virtualized divider rows with shared Category marks |
| `KJplB`, `muRAO`, `Hzbwi`, `T9esGN`, `H9S5y` | `CenteredDialog`, `TextField` and feature-owned `ExpenseFields`; amount and underlined rows shared by manual Add and Edit |
| `VgDBB`, `Ataa3` | `ExpenseNotice` and existing failure/delete actions; inline save failures, centered soft-delete confirmation |
| `DQLz1` | `features/categories/budget-list-view.tsx`; unboxed 42-unit total and divider rows |
| `D99In`, `k3FtB`, `HraLL` | `features/categories/category-configuration-view.tsx`; filled editor rows, recurrence track, grouped Rules and aggregate Save |
| `ZZMFP`, `LNW8t`, `eY68d` | Profile and feature-owned `SharedSpaceCard`, reused by Sharing; centered identity and flat translucent membership card |
| `aStNQ`, `BjioB`, `qZVeU` | `SpaceStatus` and `ChoiceSheet`; compact accessory, checked options, explicit close |
| `Z92ldV`, `y7GYIH`, `eqQ7w` | `TabBar`, `DesignSurface` navigation/Add variants and `SelectedTabBackground` |
| `naq2A`, `ugsNK`, `X2rbb` | `features/statement-import/import-view.tsx`; three-step strip, translucent selection surface and rotated file symbol. Source inspected through Pencil on 2026-10-29. Product adaptations: fixed Space, explicit accessible PDF button, supported providers, real recent history; stack route hides tabs/Add. Surface height grows for text scaling, progress, recovery and warnings. Dark uses existing semantic tokens; source has no dark import board. |

Implementation owners in this table are relative to `mobile-app/src/` unless an asset path is given. Shared `PrimaryButton`/`CompactAction`, `CategoryIconMark`, `MoneyAmount`, and modal shells supply repeated controls instead of screen-specific copies. Category glyph/color choices remain in `features/categories/category-catalog.ts`.

### Yearly Dashboard interactions

The Dashboard retains the Monthly range, Yearly selection and Category choice within the current identity/Space. Returning from a pushed Expenses/configuration screen retains the Dashboard scroll position; focus refreshes the report. Identity/Space changes reset that context. Foreground refresh uses Manila dates, retaining a selected year across New Year. The current year is labeled `YYYY · YTD`; the descending searchable year sheet also offers valid empty past years.

Summary, checks and monthly bar details use the complete report. Category selection filters only line series and their supplied Monthly references. A monthly bar opens its exact total/count and all-Category breakdown, with separate all-Expenses and Category-month actions. A Category chart month opens exact values/references and Expenses actions for visible Categories; sharing one month hit column avoids overlapping targets when points coincide. Legend entries open Category totals for the report period. Extended value lists are initially collapsed. Month targets include zero bars and share the plot/label scroll coordinates. A period change dismisses chart details; ordinary report refresh retains chart position. Yearly charts follow the API's represented months: January through the current started month for YTD and twelve months for a past year.

Server range, planning and filter semantics follow the [OpenAPI contract](../../api/docs/openapi.yaml). Annual limits are never divided into Category chart caps. A meter retains lavender allocation and adds coral only for excess, using exact text to communicate a one-cent overage. Zero plan has no percentage/remaining claim. The frequency dots describe counts rather than a chronological breach sequence.

Dark mode keeps the same hierarchy and uses the adapted slate surfaces, brighter text and semantic colors. The native sheets, 48-unit month/control targets, scalable labels and explicit actions intentionally increase height over the illustrative 390-unit board. PHP, real represented months, no-plan/empty copy and accessible details supersede the source's six-month/USD samples. These are documented adaptations, not claims of light/dark parity. See the [IP-03 verification record](../../docs/agents/implementation/IP-03-issue-150-verification.md) for observed Android results and pending fixture, iPhone, layout and screen-reader acceptance.

## Agent implementation workflow

1. Locate the matching screen and component in the source, and identify any dark adaptation. Read its `context` for interaction intent; sample amounts and counts are illustrative data.
2. Resolve declared semantic tokens for the active theme. Reuse the derived recipe for the same component role; retain source-specific variants where they differ.
3. Centralize implemented values in the mobile theme layer. Keep semantic names stable across themes and let components consume those names instead of duplicating literals.
4. Compare light and dark implementations at the reference width, then check narrow screens, large text, scrolling, keyboard clearance, and safe areas. Record any intentional visual departure and any states not covered by the source.

Completion: every changed component maps to a source node/recipe, both themes use the same semantic roles, and missing design decisions are explicitly identified.

## Declared design tokens

Use the exact kebab-case names for design interchange. Pencil references prefix them with `$`, for example `$text-primary`. A code adapter may expose camelCase, with a direct mapping back to these names.

| Token | Type | Light | Dark | Role |
| --- | --- | --- | --- | --- |
| `font-ui` | string | Outfit | Outfit | All 940 text nodes reference this family |
| `text-primary` | color | `#25334D` | `#EEF1FC` | Main text and foreground icons |
| `text-secondary` | color | `#64738B` | `#A6B1C8` | Supporting text and inactive labels |
| `brand-primary` | color | `#5361D8` | `#A4AEFF` | Primary actions, selection, emphasis |
| `surface-modal` | color | `#FAFAFE` | `#22283D` | Dialogs and bottom sheets |
| `state-warning` | color | `#986224` | `#F1C17E` | Warning meaning |
| `state-positive` | color | `#397F7A` | `#85D3C4` | Positive meaning |
| `state-negative` | color | `#A64F3D` | `#F3A594` | Error or destructive meaning |
| `type-page-title` | number | 27 | 27 | Page heading size |
| `type-section-title` | number | 15 | 15 | Section heading size |
| `type-button` | number | 15 | 15 | Primary action label size |

Colors with eight hex digits elsewhere in the design use `#RRGGBBAA`: preserve the alpha channel (for example `80` is approximately 50% opacity). Transparent layers must be evaluated over their actual background.

## Typography

Sizes and lengths below are source design units; map them to logical layout units, not physical device pixels. Preserve text scaling and content-driven height.

| Derived style | Size | Weight | Tracking | Evidence |
| --- | --- | --- | --- | --- |
| `type.pageTitle` | `type-page-title` (27) | 600 | -0.9 | `ZhdzI`, `dCYjf` |
| `type.sectionTitle` | `type-section-title` (15) | 600 | Unspecified | `GU1dJ` |
| `type.button` | `type-button` (15) | 600 | Unspecified | `SMOu5` |
| `type.amountInput` | 48 | 500 | -1.5 | `H9S5y` |

The source also uses 10–16 for dense labels/body text and 22, 23, 34, 36, and 42 for metrics. These are role-specific variants, not a requirement to use every size on every screen. Inspect the target node before choosing one. Weights are normal (400), 500, and 600. The app loads the corresponding Outfit faces through `src/navigation/app-theme.tsx`.

Most text has no explicit line height. Some text, such as `IUxWP`, specifies a 1.25 multiplier. Preserve explicit multipliers; do not interpret 1.25 as an absolute line height or invent a universal line-height token. Unspecified tracking and line height should retain the font/layout defaults until a component requires an explicit decision.

## Layout, spacing, and shape

Derived names describe reusable roles rather than a forced global spacing grid. The design uses intermediate values such as 5, 7, 9, 14, and 22; rounding everything to multiples of four changes the design.

| Derived token/recipe | Value | Evidence and use |
| --- | --- | --- |
| `layout.referenceWidth` | 390 | `FInDV`, `ZZMFP`; reference viewport, not fixed app width |
| `space.screenHorizontal` | 20 | `FInDV` padding `[0,20,16,20]` |
| `space.screenBottom` | 16 | Same source; account for runtime safe areas separately |
| `space.cardInset` | 22 | Summary card `VDouI` |
| `space.dialogInset` | 24 | Edit dialog `KJplB` |
| `space.cardGap` | 14 | Summary card `VDouI` |
| `space.dialogGap` | 24 | Edit dialog `KJplB` |
| `radius.control` | 16 | Primary action `iZLQM`, budget input `HraLL` |
| `radius.summaryCard` | 30 | `VDouI` |
| `radius.dialog` | 26 | `KJplB` |
| `radius.sheet` | `[28,28,0,0]` | `BjioB`; top corners only |
| `radius.navigation` | 32 | `Z92ldV` |
| `size.primaryAction` | height 52 | `iZLQM`, `B4i0Nm` |
| `size.fieldRow` | height 58 | `muRAO`, `Hzbwi`, `T9esGN` |
| `size.navigation` | height 64 | `Z92ldV`; enclosing row `cL45w` is 68 |
| `size.addAction` | 64 × 64 | `eqQ7w` |

Padding arrays use top/right/bottom/left order; two-value arrays mean vertical/horizontal. Radius arrays use top-left/top-right/bottom-right/bottom-left. Source `fill_container` means available space, not a numeric width.

The 40-unit radius, outer shadow, device indicators, and absolute canvas coordinates of phone frames are presentation framing. Implement native screen/safe-area behavior rather than drawing a simulated phone inside the app. The 350-unit dialog at x=20 is the 390-unit reference with 20-unit side margins; preserve those margins responsively. Sheet y positions are mockup placement, not runtime constants.

## Theme surfaces and effects

These derived recipes preserve the multi-layer appearance. Gradient rotations and sizes below are Pencil metadata; translate them to the renderer and compare visually rather than assuming another renderer uses the same angle convention.

| Derived role | Light | Dark | Evidence |
| --- | --- | --- | --- |
| `surface.canvas` | `#F6F7FC` | `#141A2B` | `FInDV`; dark adapted |
| `surface.navigation` | `#FFFFFF80` | `#272E41D9` | `Z92ldV`; dark adapted |
| `border.glass` | `#FFFFFFE6` | `#A7B1DC26` | Summary card and navigation |
| `surface.glassTint` | `#FFFFFF66` | `#272E4180` | Middle stop of the summary-card gradient; used as its tint and platform fallback |
| `shadow.summaryCard` | `#646A9D12` | `#00000040` | Summary card outer shadow |
| `border.field` | `#E5E7EF` | `#A7B1DC26` | `muRAO`; dark adapted; bottom edge, width 1 |
| `overlay.scrim` | `#20283B66` | `#06091399` | `qIxLt`; dark adapted |

### Canvas wash

Light source `FInDV` layers three radial gradients over `surface.canvas`. Each runs from stop 0 to stop 1:

| Layer | Colors | Center (x,y) | Size (width,height) |
| --- | --- | --- | --- |
| Violet | `#CBC5F1A0` → `#DFDAF400` | (1, 0.22) | (1.6, 0.8) |
| Teal | `#BCE8E690` → `#D4ECE900` | (0, 0.43) | (1.6, 0.65) |
| Lower violet | `#E2D5F276` → `#EAE0F000` | (0.85, 0.87) | (1.7, 0.6) |

The dark adaptation uses two layers: `#51437D40` → `#141A2B00` at (1, 0.22), size (1.6, 0.8), then `#28636130` → `#141A2B00` at (0, 0.43), size (1.6, 0.65). Match the target screen if it differs.

### Glass summary card

`VDouI`: radius 30, padding 22, gap 14, border width 1, background blur radius 24. Linear gradient rotation 145, stops at 0 / 0.52 / 1:

- Light: `#FFFFFFD9` / `#FFFFFF66` / `#FFFFFFA6`.
- Dark: `#272E41D9` / `#272E4180` / `#272E41D9`.
- Outer shadow: offset (0,10), blur 30; light `#646A9D12`, dark `#00000040`.
- Inner highlight: offset (0,1), blur 2; light `#FFFFFFCC`, dark `#C5CDFF12`.

Dashboard cards use the shared `DesignSurface`: native `GlassView` where supported, with the three-stop SVG gradient, border, top highlight, and outer shadow also present in the fallback. Summary/check cards use padding 20; chart cards use 22. Budget's main total is unboxed. The highlight is a one-unit line rather than a blurred inner shadow, and native blur/elevation vary by platform. The gradient direction is an approximation pending device comparison. SVG stops pass RGB and alpha separately through `stopColor` and `stopOpacity`; omitting the latter previously produced opaque canvas shapes.

### Navigation and Add action

`Z92ldV`: navigation surface, radius 32, height 64, padding 6, border width 1.5, background blur radius 32. Outer shadow offset (0,8), blur 24, light `#4E558F20` / dark `#00000040`. Inner highlight offset (0,1), blur 2, light `#FFFFFF` / dark `#C5CDFF12`.

`eqQ7w`: Add action uses the same linear gradient in both themes: rotation 145, stops `#9AA6F4D9` at 0, `#6976E6EB` at 0.48, `#505ACAD9` at 1. Border width 1.5, light `#FFFFFFCC` / dark `#A7B1DC26`; blur radius 32. Outer shadow offset (0,6), blur 18, light `#535FC94D` / dark `#00000040`. Inner highlight offset (0,2), blur 3, light `#FFFFFFA6` / dark `#C5CDFF12`.

Treat each surface as a recipe combining fill, stroke, blur, and shadow. If the target platform cannot reproduce an effect, document the fallback and verify foreground legibility on the replacement surface. Pencil blur values are design parameters, not guaranteed native API intensity values.

`DesignSurface` exposes `navigation` and `add` variants alongside the default summary card. All variants retain SVG fill, border, highlight, and shadow when `GlassView` falls back to a regular View. Native glass is an enhancement on supported iOS versions, not a reproduction of the source's numerical blur radius. Navigation/Add highlights remain one-unit lines and gradient directions are approximate. The selected tab uses `y7GYIH`'s `#E1E4FFCC` → `#F4F5FFB3` gradient and white border; its small outer shadow is omitted. Dark selection uses an adapted slate gradient. At widths below 324, navigation horizontal padding reduces from 6 to 4 to retain 48-unit tab targets at width 320.

Space selection maps to accessory `aStNQ` and sheet `BjioB`: lavender fill `#EEECFA`, border `#D8D4F0`, overlapping 28-unit initials in the accessory, and 32-unit initials in 76-unit option rows. Option rows grow with text. Unselected rows use `#FFFFFF` / `#E8E9F1`; the selected row uses a CircleCheck. Names come from current Space members; no mock member photos are fetched. Archived/read-only and remembered-selection messages remain visible alongside the accessory. Dark Space fills/borders are adaptations. The sheet close target is 48 units to preserve accessibility, exceeding the source's 44-unit control.

## Component and state rules

- **Primary action:** `iZLQM` uses `brand-primary`, height 52, radius 16, centered content, gap 8, and `type.button`. Light label `SMOu5` is white. Check the adapted dark foreground separately; a light-theme foreground is not automatically suitable over the dark-theme brand color.
- **Fields:** edit-expense rows use height 58, gap 14, and a one-unit bottom divider. Budget amount inputs (`HraLL`) use a filled surface, radius 16, and padding 20. Keep these distinct component variants.
- **Modal:** use `surface-modal` above a scrim. Edit dialog `KJplB` uses radius 26, padding/gap 24. Switcher sheet `BjioB` uses top-only radius 28, padding `[12,24,30,24]`, and gap 20. Shared shells scroll and avoid the keyboard. Their bottom inset is the greater of the native inset and 30. Backdrop dismissal defaults to enabled; Android Back invokes the supplied dismissal callback independently. Native focus/background exclusion still requires manual acceptance.
- **Icons:** the source uses Lucide icons. Match the source icon name, size, and semantic foreground. Common sizes include 14, 16, 18, and 22; small decorative icons do not define the interactive hit area. Sheet close control `qZVeU` is 44 × 44 in the source and at least 48 × 48 in the app.
- **Charts:** retain category identity across legend, bars, and breakdowns; copy the relevant chart node's palette. Category colors are data encoding, while `state-*` colors convey status. Do not infer a universal category palette or remap categories to warning/error colors from a single swatch.

## Unspecified states and implementation checks

The source does not declare a complete token system for focus, pressed, disabled, loading, motion, or reduced transparency. These remain implementation decisions requiring explicit documentation when introduced. Do not label newly chosen values as extracted design tokens.

The default filled `TextField`, used by filter/search controls, has minimum height `controlSize.field` (58), radius `radius.control` (16), horizontal padding `space.screenBottom` (16), label gap `space.fieldLabelGap` (6), a one-unit `border.field`, and `palette.surfaceModal` as fill. This fill choice is not a Pencil variable. Manual Add and Edit share the prominent 48-unit amount and 58-unit underlined rows; their date remains a YYYY-MM-DD text input. The Budget variant uses a 34-unit amount, `#FFFFFF90` light fill, padding 20 and PHP suffix. Recurrence/Appearance segmented controls use themed tracks and transparent unselected options.

## Adaptations and remaining departures

- Import Update follows `oqOst`'s compact source summary, layered queue, Remember controls, ledger and primary action hierarchy. Queue cards grow with content instead of retaining the source's 455/405 heights; a noninteractive rear layer preserves the stack treatment. One vertical FlatList owns queue/header, ledger and Continue, within safe-area and keyboard avoidance. Controls reuse shared surfaces, Category marks, dialogs and sheets with no animation. PHP, strict validation, explicit skipped passes, locked exclusions and the read-only Review ready boundary supersede illustrative behavior. Tabs/Add remain absent in the existing stack route. Light/dark native parity, large text and focus acceptance are pending device checks.

- Dark mode reuses the hierarchy with the existing adapted palette: two canvas washes, slate glass/selection/fields, lighter text and semantic status colors. Add retains the source violet gradient in both modes. There is no dark source board or native contrast acceptance yet.
- Saved Category colors remain unchanged in marks and charts; marks add tinted wells. Missing Category metadata uses a slate Shapes mark and the existing Category label. Detail/Edit receives only names and uses a neutral decorative glyph.
- Current Profile photo/name/email come from Clerk when available; a missing photo uses an initial. Space members supply names/IDs only, so membership rows/accessories use initials and omit mock photos/emails. Profile identifies its own member through Personal Space membership, since API member IDs and Clerk IDs use different namespaces; it lists all members if that ID is unavailable.
- Profile keeps Appearance inline and existing Sharing access; content therefore exceeds the source height. Space error/archive/remembered-selection messages can wrap the header. Sign-in, Sharing actions, detail/Activity, manual Add, read-only import history and the unavailable import placeholder adapt shared recipes without dedicated mockup parity. Edit profile, notifications, account deletion and import preview/commit are not added.
- Dashboard axes use exact PHP maximum/zero labels. Month columns open native detail sheets with exact values and explicit Expenses actions; extended value lists remain collapsed initially. Plot, hit columns and labels share one horizontal scroll surface, with at least 48 logical units per month, growing with text scale. Missing points break Category lines; only supplied Monthly Budget references are plotted. Yearly limits are not converted into monthly caps. Frequency dots show aggregate counts for all eligible months, not chronological statuses.
- Existing Expense and Budget filters are reachable through disclosure sheets. Budget equivalents remain available through a toggle and row accessibility labels. Category icon/color and Rule mode use sheets; grouped Rules retain add/remove, without new Rule editing. Modal handoffs (filter/Edit to Category, Space switch to unsaved confirmation) await native checks.
- `DesignSurface` approximates blurred inner shadows with one-unit highlights; SVG linear directions approximate Pencil rotations. Native glass blur is not calibrated to source radii 24/32. Android/fallback surfaces retain gradients, borders and highlights, with platform elevation/shadow differences. The selected tab omits its source shadow. Shared centered dialogs use radius 26 and omit the source alert border/outer shadow; alerts `VgDBB`/`Ataa3` instead specify radius 28. Save failures retain inline recovery rather than introducing a source-style alert.
- Native safe areas, scrolling, growing text and minimum 48-unit interactive targets take precedence over fixed mockup geometry. No phone outlines/status bars or fixed screen heights are drawn. PHP, Expense terminology, existing date/report semantics and soft deletion supersede illustrative USD/Transaction/permanent-deletion copy.

Sign-in and navigation decisions: a disabled or busy primary action uses 55% opacity. Sheets and signed-in stack transitions use no animation, so reduced motion does not need a second path. Screens wrap their scroll view in keyboard avoidance and use `keyboardShouldPersistTaps="handled"`. Navigation uses icon-only Lucide LayoutDashboard, ArrowLeftRight, PieChart, and UserRound at 22 with retained accessible tab names and selected state. The Add control uses Lucide Plus at 30. Add choices and the unavailable import destination reuse the sheet/surface recipes; the import choice explicitly says it is not available yet and still opens its existing placeholder.

Check readable contrast on composited surfaces in both modes, especially action foregrounds, small secondary labels, and charts. Preserve labels/icons alongside status colors, usable touch areas, font scaling, modal focus behavior, and screen-reader names. These are implementation checks, not a claim that the static mockup already satisfies accessibility requirements.

When updating this reference, verify declared tokens against `variables`, resolve every cited node ID, and compare light geometry/fills against the source and assess dark adaptations for legibility. A document or JSON inspection does not establish rendered visual parity; record visual comparison separately when implementing the UI.
