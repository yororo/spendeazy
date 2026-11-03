# Mobile design implementation guideline

How to execute [ux-principles.md](ux-principles.md) visually. The principles decide *what* to show; this file decides *how it looks*. If they conflict, ask the user.

This file is generic. It holds rules, token roles and recipes only. Do not add per-screen, per-component or per-feature notes, node-ID maps, status/acceptance records or product copy here.

## Sources of truth (in priority order)

1. [`src/constants/theme.ts`](../src/constants/theme.ts): **all values** (colors per theme, fonts, type scale, spacing, radius, control sizes, gradient/canvas recipes). Read it; never copy values from memory or from this file.
2. [`mobile-design.pen`](mobile-design.pen): visual reference for layout and composition. This is only to provide visual ideas, inspiration, and direction; not to be treated as the actual state. `.pen` files are encrypted; read only via the Pencil MCP tools. Sample data in it is illustrative. 
3. Existing shared components in `src/components/`: the implementation of the recipes below.
4. This file: rules for anything the above do not answer.

Light values come from the design source. Dark values are implementation adaptations; the source has no dark board.

## Workflow

1. Search `src/components/` and `theme.ts` for an existing component/token that fits. Reuse it (ux-principles rule 6).
2. If none fits, compose from existing tokens. Look at the closest design-source screen for composition only.
3. Add a new token only when a value is used in 2+ places or must differ per theme. Add it to `theme.ts` with a semantic name, with both themes.
4. Verify: light and dark, 320-wide screen, large text, keyboard, safe areas, screen reader.
5. If a design decision is missing, say so in the change summary. Do not invent a value and present it as design-derived.

## Hard rules

- No hardcoded colors, font names, sizes, spacing, radii or shadows in components. Import from `theme.ts`.
- Name by role (`textSecondary`, `stateNegative`), never by appearance (`lavender`, `coral`) or by feature.
- Same semantic role in both themes. Never assume a light-theme value (e.g. white label) is valid in dark; use the `on*` foreground token paired with the fill.
- Never use a `state*` color for data encoding, or a data/category color for status.
- Never convey meaning by color alone (pair with icon, text or shape).
- Do not round values to a 4/8 grid; intermediate values (5, 7, 14, 22) are intentional. Use existing tokens.
- Do not render a simulated phone frame, device indicators or absolute canvas coordinates. Design-source `fill_container` means "available space".
- Layout must flex: reference width is 390, not fixed. Heights grow with content and text scaling.

## Token map (roles, not values)

Values: `theme.ts`. Exports: `palette` (per theme, via `paletteFor`), `fontFamily`, `typeScale`, `space`, `radius`, `controlSize`, `designRecipes`.

| Group | Roles | Use |
| --- | --- | --- |
| Text | `textPrimary`, `textSecondary` | Primary: content and foreground icons. Secondary: supporting text, inactive labels, metadata |
| Brand | `brandPrimary` + `onBrand` | Primary actions, selection, emphasis. Always pair fill with its `on*` foreground |
| State | `stateWarning`, `statePositive`, `stateNegative` | Status meaning only (warning, success, error/destructive) |
| Surface | `canvas`, `surfaceModal`, glass/card/field fills | Canvas = screen background. Modal = dialogs and sheets. Cards use glass recipe |
| Line | `divider`, `fieldBorder`, glass/navigation borders | 1-unit hairlines unless a recipe says otherwise |
| Overlay | `scrim`, `shadow` | Behind modals; elevation |
| Data | chart/meter colors | Data encoding only |

Alpha: 8-digit hex is `#RRGGBBAA`; keep the alpha. Evaluate translucent layers over their real background, in both themes. In SVG, pass RGB to `stopColor` and alpha to `stopOpacity` separately; omitting opacity renders opaque.

## Typography

- One family: Outfit, loaded via the app theme. Use `fontFamily.regular|medium|semibold` (400/500/600); do not use other weights or raw family strings.
- Use `typeScale` roles. Do not add sizes; pick the nearest existing role. A new role needs a new `typeScale` entry.
- Roles: page title (heading, tight tracking), section title, button label, body, metadata (dense secondary text), metric (large figures).
- Sizes are logical units, not pixels. Always allow text scaling; never clip or fix height on text containers.
- Line height and tracking: leave at font default unless the role defines one in `theme.ts`. Do not add a universal line-height.
- Hierarchy comes from size/weight and `textPrimary` vs `textSecondary`, not from extra colors.
- Monetary amounts use the shared money component; do not format currency ad hoc.

## Layout, spacing, shape

- Screen: horizontal padding `space.screenHorizontal`; scrolling, safe areas, keyboard avoidance and text scaling are owned by the shared `Screen`. Do not reimplement them.
- Use `space.*` for insets and gaps; use `radius.*` for corners. Nested radius must be smaller than its container.
- Radius scale by role: control < dialog < summary card < navigation. Sheets round the top corners only.
- Padding arrays: top/right/bottom/left; two values = vertical/horizontal. Radius arrays: TL/TR/BR/BL.
- Sheet/dialog bottom inset = max(native safe-area inset, `space.sheetPaddingBottom`).
- Prefer dividers and whitespace over nested boxes. No card inside a card.

## Controls and sizes

Use `controlSize.*`. Do not hand-size controls.

| Rule | Requirement |
| --- | --- |
| Minimum touch target | `controlSize.minimumTarget` (48) for every interactive element, including icon-only. Decorative icon size never defines hit area; extend the hit area (padding/hitSlop) |
| Primary action | `controlSize.primaryAction` height, `radius.control`, `brandPrimary` fill, `onBrand` label, button type role, centered content. Use shared button components |
| Field | Minimum `controlSize.field` height, `radius.control` if filled; labels sit above with `space.fieldLabelGap`. Use shared `TextField`/date field |
| Field variants | Filled (boxed) or underlined (bottom `fieldBorder`). Pick one per form; do not mix within a form |
| Segmented/toggle | Themed track, transparent unselected options, selected uses `segmentedSelected` |
| Selected state | Tint fill and/or check icon; never color alone |
| Disabled | Reduce emphasis (lower opacity), keep layout; also set the accessibility disabled state |

## Surfaces and effects

A surface is a recipe: fill + border + blur + shadow + highlight. Reuse `DesignSurface` variants rather than rebuilding.

- **Canvas:** `designRecipes.*.canvas` radial-gradient wash over `palette.canvas`, painted behind the viewport by the shared canvas component. Do not add per-screen backgrounds.
- **Glass card:** gradient fill (`designRecipes.*.glass`), 1-unit `glassBorder`, 1-unit top highlight, soft outer shadow. Native `GlassView` where supported; the SVG fill, border, highlight and shadow must remain as the fallback.
- **Navigation / floating action:** use the existing `DesignSurface` variants. On native Liquid Glass, let the system material own fill and rim (omit painted fill, highlight, border). Elsewhere keep the painted recipe.
- **Modal:** `surfaceModal` over `scrim`.
- Pencil blur radii and gradient angles are design parameters, not native intensities or the same angle convention. Match visually; document a fallback when an effect cannot be reproduced and check foreground legibility on it.
- Keep a visible foreground contrast on translucent surfaces in both themes.

## Icons

- Lucide only. Choose by meaning (ux-principles rule 1). Reuse the icon already used for the same concept elsewhere in the app.
- Sizes follow adjacent text: roughly 14-18 inline, ~22 for standalone actions. Color via `textPrimary`, `textSecondary`, `brandPrimary` or a `state*` role.
- Icon-only controls require an accessible label.

## Overlays

- **Dialog:** centered, `surfaceModal`, `radius.dialog`, `space.dialogInset`/`dialogGap`, side margins preserved responsively. Destructive confirmations: initial focus on the safe (cancel) action.
- **Sheet:** bottom, `surfaceModal`, `radius.sheet` top only, `space.sheet`* padding/gap, content scrolls, max height ~65% for choice lists, explicit close control (48 target).
- **Popover:** anchored, for short option lists and secondary options.
- All overlays: scrim behind, keyboard-aware, backdrop tap dismisses unless data loss risk, Android Back dismisses.
- Use the shared choice sheet/popover/dialog components; do not build new shells.

## Data visualization

- Chart/meter colors encode data; keep one stable identity color per series across legend, marks and breakdowns.
- Do not remap series colors to `state*`. Do not invent a global series palette; reuse the existing catalog.
- Show exact values on demand (tap/detail), not as permanent clutter. Meters: track + fill; add the excess color only for overage.
- Provide text/accessible equivalents for every graphic (ux-principles rule 5).

## States and motion

The design source does not define focus, pressed, loading, disabled or motion tokens. Treat these as implementation decisions:

- Reuse existing semantic colors; do not label new values as design-derived.
- Loading: use the shared skeleton component with existing track colors; keep loaded content visible during refresh.
- Motion: minimal, functional, no decorative animation. Honor reduced motion (live changes).
- Errors: inline, near the cause, `stateNegative` + icon/text, and retain user input.
- Pressed/focus: use opacity or tint from existing tokens; keep focus visible for assistive tech.

## Accessibility checklist

- 48-unit targets, accessible labels on icon-only controls, roles/states set (selected, disabled, expanded).
- Text scales without clipping; layouts work at 320 width.
- Contrast holds on every surface in both themes; no color-only meaning.
- Screen-reader order matches visual order; overlays move and restore focus.
- Reduced motion and reduced transparency respected.

## Definition of done

- No raw literals for color, size, spacing, radius, font; all from `theme.ts`.
- Reused shared components; any new token exists in both themes.
- Both themes, narrow width, large text, keyboard and safe areas checked.
- Unspecified design decisions listed explicitly in the summary.

## Maintaining this file

Update it only when a generic rule or token role changes. Values live in `theme.ts`. If a rule needs a component name or screen name to make sense, it belongs somewhere else.
