# Implementation Plan: Mobile UI Design Alignment

## 1. Overview

- **Objective:** Make the existing native mobile UI closely match `mobile-app/design/mobile-design.pen`, including composition, gradients, transparency, typography, icons, spacing, and surfaces.
- **Scope:** Presentation of existing sign-in, navigation, Dashboard, Expenses, Budget/Category/Rules, Profile, Sharing, Space switching, and read-only import history. Prefer reusable visual components wherever the same design recipe recurs.
- **Constraints:** No new product functionality, API changes, financial calculations, domain changes, unrelated refactoring, or automated tests. The user will perform manual testing. Retain existing callbacks, validation, drafts, navigation destinations, permissions, pagination, and persistence. Reuse extraction only for visual code touched by this redesign.
- **Authority:** The user explicitly confirmed the nested `.pen` file above on 2026-10-28; it overrides ticket references to the missing `mobile-app/mobile-design.pen`. Read `.pen` content through Pencil tools only. Do not modify the design source.

## 2. Current State

- `mobile-app` uses Expo SDK 58, React Native 0.88, Expo Router, Lucide, `react-native-svg`, and `expo-glass-effect`. Outfit 400/500/600 is already loaded by `src/navigation/app-theme.tsx`; no font migration is needed.
- `src/constants/theme.ts` supplies semantic colors and dimensions. Screens generally have flat canvas fills; navigation has opaque fills and text labels. Shared buttons and fields have broad, uniform styling.
- Shared presentation lives in `src/components/`: `screen.tsx`, `buttons.tsx`, `text-field.tsx`, `choice-sheet.tsx`, `space-status.tsx`, `money-amount.tsx`, and `tab-bar.tsx`. Feature views live under `src/features/`; route composition lives under `src/app/`.
- GitHub #140 implementation tickets #143–#149 are closed: authentication/navigation, manual Expenses, corrections/history, Sharing, configuration, Budget browsing, and Monthly Dashboard. Yearly Dashboard and basic import history also exist in code despite broader tickets #150/#155 remaining open. Preserve and restyle those existing portions without completing their tickets.
- `src/api/dashboard-report-api-client.ts` exposes summary, monthly Expenses, category monthly series, and Budget checks. Rendering line charts and frequency dots can use these existing values without changing reporting contracts.
- `src/application/spaces/active-space.ts` exposes member IDs/names, not member photos/emails. Current signed-in identity information comes from Clerk. Do not add requests to fill mockup-only identity details.
- The connected design contains light screens and unthemed variables only. The existing `design-token.md` incorrectly describes a dark board in this file and includes older implementation limitations.

## 3. Proposed Solution

Implement a small shared visual vocabulary, then compose feature-specific layouts from it. Keep business logic in its existing owners. Reuse existing components first; add explicit visual variants rather than replacing every control with a generic abstraction.

### Design references and decisions

| Reference node | Apply to |
| --- | --- |
| `MONtk`, `VvvB3` | Monthly/Yearly Dashboard composition |
| `ur6VR`, `oMcp7`, `BfC6x` | Dashboard summary, frequency checks, category chart |
| `Qd5CZ` | Expenses total, toolbar, and divider rows |
| `DQLz1` | Unboxed Budget total and category rows |
| `D99In`, `k3FtB` | Existing/new Category and Budget editor |
| `KJplB` | Expense edit dialog and field treatment |
| `VgDBB`, `Ataa3` | Existing save-error and delete-confirmation presentation |
| `ZZMFP` | Profile identity and Shared Space card |
| `BjioB` | Space selection sheet |
| `Z92ldV`, `eqQ7w` | Floating navigation and Add action |

Use the 390-unit width as the fidelity reference, with 20-unit horizontal margins and native safe areas. Do not draw mock phone outlines, fake status bars, or hardcode the canvas screen heights. Content scrolls behind floating navigation with sufficient bottom clearance.

Implement the light canvas as its base `#F6F7FC` plus the three source radial gradients. Preserve exact alpha values and layer ordering. Dashboard cards use the three-stop white gradient, border, highlight, shadow, and radius 30; Budget's main total has no card. Navigation is a translucent radius-32 pill, 64 high; the separate 64-square Add action uses the source three-stop violet gradient and 30-unit plus icon. Match source-specific padding instead of forcing every card to one inset.

Use `react-native-svg`, already installed, for responsive radial/linear gradients and charts. Reuse `GlassView` only as supported enhancement; gradients, border, and highlight must also render in the fallback. Keep decorative layers noninteractive and hidden from accessibility. No new native dependency is planned. Do not apply opacity to whole containers, which would also fade text. Document any remaining platform-specific blur departure.

Reuse the existing dark palette to adapt the same composition; do not claim dark-mode mockup parity. Preserve Category Color identity across rows and charts, using tinted wells instead of changing saved colors. Preserve PHP and Expense terminology, current date/reporting semantics, and soft deletion regardless of illustrative USD/Transaction/permanent-deletion copy in the mockup.

Official implementation references: [Expo SDK 58 GlassEffect](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/), [React Native accessibility](https://reactnative.dev/docs/accessibility), and [react-native-svg usage](https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md). SVG supports the gradient/chart primitives; native glass must not be assumed to render identically on all platforms. Preserve accessible labels/state when replacing visible labels with icons.

## 4. Implementation Tasks

All paths below are relative to `mobile-app/` unless prefixed otherwise. Suggested new files are explicitly marked **new**. Execute tasks in order; tasks 3–8 depend on the shared foundation in tasks 1–2.

### Task 1: Establish design recipes and shared surfaces

- **Goal:** One consistent implementation of background, glass, typography, and shape recipes.
- **Location:** `src/constants/theme.ts`, `src/components/screen.tsx`; **new** `src/components/design-surface.tsx`; `design-token.md`.
- **Changes:** Add semantic gradient stops, borders, shadows, highlights, and text roles extracted from the source. Keep existing semantic roles stable. Implement reusable canvas and surface variants using SVG and existing glass support. Make the shared screen background reusable by the Expenses `FlatList` without nesting it in a `ScrollView`. Match per-screen spacing, retain safe-area/keyboard handling, and use a viewport-sized background rather than stretching gradients over long content. Correct the design authority/dark-board documentation and distinguish extracted light recipes from dark adaptations. Use existing Outfit faces, not synthetic weights.
- **Verification:** Manually compare a short and long screen at reference width: gradient placement, transparent layering, shadow clipping, margins, scroll clearance, and light/dark foreground legibility.

### Task 2: Create reusable visual controls and header composition

- **Goal:** Consistent controls without per-screen copies of the same styling.
- **Location:** `src/components/buttons.tsx`, `text-field.tsx`, `money-amount.tsx`, `choice-sheet.tsx`; **new** `src/components/screen-header.tsx` and `src/components/category-mark.tsx`; existing `src/features/categories/category-configuration-view.tsx`.
- **Changes:** Extend buttons with compact chip, icon, segmented-option, and quiet-action presentation where used. Keep primary actions at least 52 high and interactive targets at least 48, even when visible toolbar shapes are smaller. Extend fields with filled, underlined icon-row, and prominent amount variants while retaining controlled values/errors. Share the category mark/catalog mapping across screens; adjust existing `CategoryIconMark` only as needed for these consumers. Add the small brand/title/accessory header composition; export the exact existing brand mark from Pencil rather than drawing a replacement. Make sheet and centered-dialog visual shells reusable, retaining each existing modal's dismissal/confirmation semantics. Avoid adding a universal form, state manager, or UI library.
- **Verification:** Manually compare representative controls and dialogs; confirm disabled/busy/error visibility, font scaling, icon labels, keyboard reachability, and that decorative SVGs do not intercept touches.

### Task 3: Match navigation and Space switching

- **Goal:** Reproduce icon-only navigation and the compact Space identity treatment.
- **Location:** `src/components/tab-bar.tsx`, `src/components/space-status.tsx`, `src/app/(app)/add.tsx`; use the header/sheet primitives from task 2.
- **Changes:** Render four icon-only tabs in the glass pill with a lavender selected capsule, source Lucide glyphs, and the separate gradient Add circle. Retain existing tab routing and accessible names. Render Space selection as a compact header accessory while retaining loading, failure, archived, and remembered-selection messages. Match `BjioB` option rows and selected check. Use initials for member images unavailable in the current data. Retain unsaved Expense confirmation. Restyle existing Add choices and unavailable import placeholder; do not enable imports or remove the existing destination.
- **Verification:** Manually visit every tab, open/dismiss Add and Space sheets, switch Personal/Shared/archived Spaces, and check unsaved-work protection and bottom safe areas.

### Task 4: Redesign Expenses and existing Expense flows

- **Goal:** Match the total/list/dialog hierarchy while retaining every existing Expense action.
- **Location:** `src/features/expenses/browse-view.tsx`, `manual-view.tsx`, `detail-view.tsx`; shared components from tasks 1–3.
- **Changes:** Put total/count centrally above a compact filter toolbar; use the source 42-unit total, 14-unit row descriptions, 15-unit amounts, and minimum 12-unit metadata. Build divider rows with category icons, left description/category, and right amount/date. Preserve virtualization, scroll restoration, search submission, arbitrary date ranges, category filtering, sorting, pagination, Deleted Expenses, and Dashboard-return access. Existing filters may be revealed in a presentation-only sheet; keep their existing callbacks and semantics, without introducing month presets. Match the edit dialog's prominent amount and 58-unit underlined rows. Apply that language to manual Add Expense and existing detail/Activity screens. Restyle existing failure/delete states without introducing new alert flows or changing soft deletion.
- **Verification:** Manually browse/filter/search/paginate; create, edit, delete, and inspect retained Activity; return to the originating list and confirm filter/scroll restoration. Confirm keyboard access, retained validation errors, and retry controls remain usable.

### Task 5: Redesign Budget and Category configuration

- **Goal:** Match the centered plan total, divider rows, and compact editor.
- **Location:** `src/features/categories/budget-list-view.tsx`, `category-configuration-view.tsx`, `category-catalog.ts` (visual mapping only).
- **Changes:** Replace the Budget summary card with the unboxed 42-unit total and annual-equivalent subtitle. Use toolbar chips/icons and divider rows with pastel category wells and right-aligned amounts/periods. Move the existing create action to the section toolbar. Preserve active/inactive, unset/Monthly/Yearly filters, search, exact sort semantics, and reachable equivalent amounts; do not add the mockup's unsupported sort modes. Use the editor's filled category/amount rows, Monthly/Yearly segmented control, grouped Rule presentation, compact composer, and bottom Save action. Preserve all existing name/icon/color choices, Rule add/remove, Budget removal, activation, conflict handling, and aggregate save. Do not add Rule editing just to match pencil icons in the design.
- **Verification:** Manually compare populated/unset/inactive lists; exercise existing filters/sorts, create/update a Category, change recurrence, remove a Budget, add/remove Rules, and inspect validation/conflict/read-only states.

### Task 6: Recompose Dashboard and chart presentation

- **Goal:** Match source cards and charts using existing report data.
- **Location:** `src/features/dashboard/dashboard-view.tsx`, existing `dashboard-format.ts`; **new**, if needed, `src/features/dashboard/dashboard-charts.tsx` for view-only SVG rendering.
- **Changes:** Arrange period controls, Summary, Budget checks, monthly bars, and category line chart in that order. Compact the existing Monthly/Yearly controls and period navigation; retain the six-month query behavior and current year selection, without adding range presets. Show existing actual/planned comparison as a meter, with highest Category and import count/latest date beneath. Preserve access to existing plan/equivalent/count information without crowding the primary hierarchy. Render monthly check frequencies from `overBudgetMonths`/`eligibleMonths`; represent full frequency if it exceeds six rather than forcing six dots. Keep Yearly checks and their existing statuses/limits. Render lavender monthly bars, appropriate axes, and plan threshold. Use existing `categoryExpenses[].months` for category-colored line series and valid budget references; do not invent monthly caps for Yearly Budgets. Retain category selection and existing Expense/Budget/history drill-through callbacks with accessible hit targets or equivalent labeled controls. Do not add chart popovers or searchable multiselect. Convert amounts to plotting coordinates only; retain existing exact financial formatting/comparison rules and update values immediately.
- **Verification:** Manually compare both report modes with zero plan, empty results, over-plan spending, selected Categories, and longer Yearly ranges. Check axis/series alignment, annual-limit semantics, accessible drill-through, and Back restoration. No fabricated sample values or new requests.

### Task 7: Redesign Profile, Sharing, and unmatched surfaces

- **Goal:** Extend the same design language to all existing product screens.
- **Location:** `src/app/(app)/(tabs)/profile.tsx`, `src/app/(auth)/sign-in.tsx`, `src/features/sharing/sharing-view.tsx`, `src/features/statement-import-history/statement-import-history-view.tsx`, `src/app/(app)/import-statement.tsx`.
- **Changes:** Center the current user's avatar/name/email, style the available Shared Space information as the source card, and use an understated Sign out action. Keep System/Light/Dark and Sharing access reachable; omit Edit profile, notification bell, account deletion, and any nonfunctional action. Render partner initials/name without invented photo/email data. Style invitation codes, existing invitation actions, archive warnings, history rows, and sign-in with the shared primitives. Keep basic import history read-only and the unavailable import placeholder honest. Do not add filters, import details, or modify the parser-proof screen.
- **Verification:** Manually inspect profile with/without Shared membership, all Appearance choices, existing Sharing/invitation/archive flows, sign-in failure/expiry presentation, empty/populated history, and unavailable import messaging.

### Task 8: Document and prepare the visual handoff

- **Goal:** Deliver a reviewable UI change and an actionable manual acceptance checklist.
- **Location:** `design-token.md`, root `implementation-plan.md`.
- **Changes:** Record source-node mappings, shared recipes, dark adaptations, missing-data substitutions, and platform effect departures. Remove stale claims about effects now implemented. Keep documentation changes limited to this redesign. **Verification:** Review the diff for presentation-only scope, shared component reuse, unchanged workflow/API owners, documented deviations. Planning alone does not require application edits or delivery claims.

## 5. Testing and Validation

**Manual testing is the behavioral and visual acceptance method, performed by the user. Do not add, update, or run unit, component, snapshot, parser, end-to-end, or screenshot-automation suites for this task. Do not remove or weaken existing tests/CI.** Existing independent CI may still run; report its actual status separately from manual acceptance.

Static implementation checks, distinct from automated tests, are `npm --prefix mobile-app run lint` and `npm --prefix mobile-app run typecheck`. Run after implementation, not for this planning-only deliverable.

Use `docs/local-testing.md` for native startup/reload and the dedicated development API/database. Ordinary JS changes should not require a new native dependency/build. The user checks Android and iPhone, light/dark/System, reference width 390 and narrow 320/360 layouts where configurable, large text, landscape, keyboard, safe areas, scrolling, and readable fallback surfaces. Verify VoiceOver/TalkBack names/selection, modal focus/background exclusion, and control targets.

For each task, manually execute its verification steps. Compare matching screens side by side with Pencil using fictional data; inspect composition, font weight/size/tracking, gradient position/alpha, borders, icon glyph/size, and shadows. Note expected differences from live data. Record device/OS, app/API revisions, steps, results, and sanitized evidence. Native evidence and #138 parser certification are not established by this UI task. No sign-in, build, or device pass is implied by the plan.

## 6. Acceptance Criteria

- Matched light screens closely reproduce the identified source nodes at reference width; any material visual departure is disclosed for user acceptance.
- Shared backgrounds, surfaces, headers, fields, actions, category marks, and modal shells use common recipes/components, with screen-specific variants where the source differs.
- Dark Appearance stays functional and readable using the same hierarchy; it is documented as adapted.
- All existing actions/data remain reachable and retain their semantics, including exact PHP values, Category identity, read-only archives, drafts, error recovery, and navigation restoration.
- No speculative mockup features, new API requests, controller/rule refactors, or automated test changes are introduced.
- The user completes the manual checklist or remaining cases are explicitly marked pending; static checks and CI results are reported separately.

## 7. Assumptions and Open Questions

- No critical design decision remains: the user confirmed the source and proposed scope. This file has no dedicated designs for sign-in, manual Add Expense, detail/Activity, invitation management, basic import history, or dark mode; use the inspected shared recipes for those surfaces.
- Accessibility minima, native safe areas, actual data availability, PHP terminology, and shipped behavior take precedence over illustrative source text/geometry. In particular, retain soft deletion and omit inaccessible functionality.
- Presentation-only disclosure sheets are allowed to compact existing controls. They must not add filter options, query behavior, requests, or persistence.
- Avoid adding animation scope; retain existing behavior and respect reduced motion for any visual transition introduced incidentally. No new financial-value animation.
