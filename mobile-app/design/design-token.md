# Mobile design-token reference

Use this document when implementing or reviewing mobile colors, typography, spacing, shapes, icons, surfaces, navigation, or dialogs.

## Source and authority

Source: [`design/mobile-design.pen`](design/mobile-design.pen). The confirmed source contains light screens and unthemed variables. Dark values in this document are implementation adaptations, not a dark design board.

**Declared** light tokens below exist in the source `variables` object; dark values are adaptations. **Derived** names are conventions introduced here for repeated literal values or component recipes; they are not existing Pencil variables or runtime exports. Node IDs are lookup keys in the source JSON. When the design changes, update the affected table and its evidence together. Resolve conflicts against the current source node, and record intentional departures rather than silently choosing another value.

[`src/constants/theme.ts`](src/constants/theme.ts) implements the declared colors, Outfit families, page/section/button sizes, and the spacing, radius, and control sizes used by sign-in and navigation. Navigation and Add use opaque fills taken from the glass recipe so contrast does not depend on blur. The light navigation edge uses `border.field` because a white glass stroke disappears on an opaque white bar. The shared canvas paints the light wash and a dark adaptation behind the viewport; Expenses uses the same background behind its virtualized list.

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

The source also uses 10–16 for dense labels/body text and 22, 23, 34, 36, and 42 for metrics. These are role-specific variants, not a requirement to use every size on every screen. Inspect the target node before choosing one. Weights are normal (400), 500, and 600. Load actual Outfit faces for these weights when implementing; the starter system-font mapping is not visual parity.

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
| `radius.sheet` | `[28,28,0,0]` | Switcher sheet; top corners only |
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

The Budget plan summary uses the shared `DesignSurface`: native `GlassView` where supported, with the three-stop SVG gradient, border, top highlight, and outer shadow also present in the fallback. The highlight is a one-unit line rather than a blurred inner shadow, and native blur/elevation vary by platform. The gradient direction is an approximation pending device comparison.

### Navigation and Add action

`Z92ldV`: navigation surface, radius 32, height 64, padding 6, border width 1.5, background blur radius 32. Outer shadow offset (0,8), blur 24, light `#4E558F20` / dark `#00000040`. Inner highlight offset (0,1), blur 2, light `#FFFFFF` / dark `#C5CDFF12`.

`eqQ7w`: Add action uses the same linear gradient in both themes: rotation 145, stops `#9AA6F4D9` at 0, `#6976E6EB` at 0.48, `#505ACAD9` at 1. Border width 1.5, light `#FFFFFFCC` / dark `#A7B1DC26`; blur radius 32. Outer shadow offset (0,6), blur 18, light `#535FC94D` / dark `#00000040`. Inner highlight offset (0,2), blur 3, light `#FFFFFFA6` / dark `#C5CDFF12`.

Treat each surface as a recipe combining fill, stroke, blur, and shadow. If the target platform cannot reproduce an effect, document the fallback and verify foreground legibility on the replacement surface. Pencil blur values are design parameters, not guaranteed native API intensity values.

## Component and state rules

- **Primary action:** `iZLQM` uses `brand-primary`, height 52, radius 16, centered content, gap 8, and `type.button`. Light label `SMOu5` is white. Check the adapted dark foreground separately; a light-theme foreground is not automatically suitable over the dark-theme brand color.
- **Fields:** edit-expense rows use height 58, gap 14, and a one-unit bottom divider. Budget amount inputs (`HraLL`) use a filled surface, radius 16, and padding 20. Keep these distinct component variants.
- **Modal:** use `surface-modal` above a scrim. Edit dialog `KJplB` uses radius 26, padding/gap 24. Switcher sheet `wQtDU` uses top-only radius 28, padding `[12,24,30,24]`, and gap 20. Source context specifies disabled underlying controls for alerts and tap-to-dismiss for the switcher scrim; implement the behavior for the specific modal.
- **Icons:** the source uses Lucide icons. Match the source icon name, size, and semantic foreground. Common sizes include 14, 16, 18, and 22; small decorative icons do not define the interactive hit area. Sheet close control `s0pm4` is 44 × 44.
- **Charts:** retain category identity across legend, bars, and breakdowns; copy the relevant chart node's palette. Category colors are data encoding, while `state-*` colors convey status. Do not infer a universal category palette or remap categories to warning/error colors from a single swatch.

## Unspecified states and implementation checks

The source does not declare a complete token system for focus, pressed, disabled, loading, motion, or reduced transparency. These remain implementation decisions requiring explicit documentation when introduced. Do not label newly chosen values as extracted design tokens.

Add Expense and Expenses filters use a filled text field: height `controlSize.field` (58), radius `radius.control` (16), horizontal padding `space.screenBottom` (16), label gap `space.fieldLabelGap` (6), a one-unit `border.field`, and `surface.modal` as the fill because the source has no separate field-fill token. This is an implementation choice, not a Pencil variable. It is distinct from the edit-expense bottom-divider row.

Sign-in and navigation decisions: a disabled or busy primary action uses 55% opacity. Sheets and signed-in stack transitions use no animation, so reduced motion does not need a second path. Screens wrap their scroll view in keyboard avoidance and use `keyboardShouldPersistTaps="handled"`. These screens do not collect typed input. Navigation icons are Lucide, size 18, in the semantic text color. The Add control uses Lucide `plus` at 22.

Check readable contrast on composited surfaces in both modes, especially action foregrounds, small secondary labels, and charts. Preserve labels/icons alongside status colors, usable touch areas, font scaling, modal focus behavior, and screen-reader names. These are implementation checks, not a claim that the static mockup already satisfies accessibility requirements.

When updating this reference, verify declared tokens against `variables`, resolve every cited node ID, and compare light geometry/fills against the source and assess dark adaptations for legibility. A document or JSON inspection does not establish rendered visual parity; record visual comparison separately when implementing the UI.
