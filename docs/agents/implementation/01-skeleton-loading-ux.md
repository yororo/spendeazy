# Implementation Plan: Responsive skeleton loading

## 1. Overview
- **Objective:** Give immediate, layout-matched loading feedback during Dashboard period changes and bottom-tab navigation.
- **Scope:** Dashboard, Expenses, Budget and Profile tab loading states; shared skeleton primitives and focused verification. Proposal only until the user confirms.
- **Excluded:** API changes, new caching/prefetch systems, navigation migration, and implementation of the additional suggestions below. Skeletons improve perceived responsiveness; they do not reduce network latency or solve JavaScript rendering stalls.
- **Constraints:** Native Android/iOS, existing theme and design surfaces, no new dependency. Preserve unrelated working-tree edits, including Dashboard and design-token changes present when this plan was written.

## 2. Current State
- `mobile-app/src/features/dashboard/use-dashboard-report.ts` creates a new session resource when the period query changes. It exposes `loading` for missing report data and `refreshing` for updates with existing data. Request identity and session checks already reject obsolete completions.
- `mobile-app/src/features/dashboard/dashboard-view.tsx` shows a loading sentence without a report. Its refresh control currently combines initial loading and refreshing.
- `mobile-app/src/app/(app)/(tabs)/_layout.tsx` owns four tabs using the custom `mobile-app/src/components/tab-bar.tsx`. Dashboard and Budget refresh on subsequent focus; Profile refreshes Spaces on focus. Expenses owns its resource lifecycle separately.
- `mobile-app/src/features/expenses/browse-view.tsx` uses FlatList with text loading feedback, a total header, persistent filters and separate pagination/refresh states.
- `mobile-app/src/features/categories/budget-list-view.tsx` shows loading text for totals and Categories when data is missing. `use-budget-categories.ts` already distinguishes initial loading and refresh.
- Profile renders directly in `mobile-app/src/app/(app)/(tabs)/profile.tsx`, using Clerk identity and the Spaces provider. Missing Shared Space data can currently produce an empty-state message during loading.
- `mobile-app/src/application/spaces/provider.tsx` exposes loading, refreshing and error state. Dashboard/Budget must account for initial Spaces loading before an active Space exists.
- No shared skeleton component was found. `mobile-app/design/design-token.md` explicitly leaves loading/motion values as implementation decisions requiring documentation. Match existing layouts in `mobile-app/design/mobile-design.pen` and existing semantic colors.

## 3. Proposed Solution

### Loading policy
| Situation | Behavior |
| --- | --- |
| Dashboard initial load, monthly range/year change, Monthly/Yearly switch | Immediately update the selected control; show skeleton bodies for Summary, Budget checks and both chart cards until the matching report arrives. Keep header and period controls visible. |
| First tab visit with missing data | Render the destination shell immediately and show feature-shaped skeletons only where data is pending. Keep navigation usable. |
| Return to a mounted tab with usable data | Render existing content immediately. Keep content during background refresh; use the existing refresh feedback. |
| Initial Spaces resolution | Use the destination feature skeleton while Space-dependent data is unavailable; avoid a blank body or premature empty state. Stop on Spaces failure and expose retry. |
| Pull to refresh with data | Keep content and use the existing refresh control. Do not replace content with skeletons. |
| Completed empty response or error | Render the established empty/error state and retry action. Never leave skeletons indefinitely after failure. |

- Provide a small shared rounded block/line primitive and loading-region wrapper in a new `mobile-app/src/components/skeleton.tsx`. Keep feature arrangements with their owning views or feature-local skeleton files.
- Reuse semantic neutral fills such as `meterTrack`, existing radii, spacing and `DesignSurface`. Keep placeholders close to the real totals, rows and chart footprint to reduce layout jumps; do not draw fake numerical chart data.
- Use a subtle opacity pulse through the installed Reanimated package. Respect system reduced motion with static blocks; stop repeating animation when the tab is unfocused or the app is inactive. Avoid per-row timers or React state updates per frame. Show content as soon as ready; no artificial minimum loading duration or transition delay.
- Expose one short accessible loading label and busy state per pending region; hide decorative blocks from TalkBack/VoiceOver and prevent interactions with placeholders. Keep available controls accessible.
- Use actual readiness, not a tab-press timer or full-screen overlay. Preserve the existing navigator and mounting behavior; do not force remounts or loading on every tap. Repeatedly selecting the active tab should not introduce placeholders.
- Keep request policy in controllers and presentation in views. Preserve session/Space isolation and cancellation. A resource for a previous period must never be displayed under a new period selection.
- Dashboard's year picker currently derives valid years from the report, which disappears on period changes. Retain only the last known `range.today` within the current identity/Space as picker metadata if needed, so the year control remains usable during replacement loads. Do not retain the old financial report for display. Reset metadata when scope changes.
- Shared views may also serve drill-down routes. Reuse their loading presentation where it follows naturally from using the same view, without expanding this task into separate detail/history workflows.

## 4. Implementation Tasks

### Task 1: Shared loading visuals
- **Goal:** A small, accessible, theme-aware skeleton building block.
- **Location:** New `mobile-app/src/components/skeleton.tsx`; `mobile-app/design/design-token.md`.
- **Changes:** Implement blocks/lines and a labeled loading region using existing tokens. Add optional activity input to suspend pulse. Document the chosen loading color, opacity/timing and reduced-motion treatment as implementation adaptations. Preserve existing design notes.
- **Verification:** Inspect light/dark and large-text layouts; verify one accessible loading region rather than individual blocks, static reduced-motion appearance and stopped offscreen animation.

### Task 2: Dashboard period loading
- **Goal:** Immediate feedback for range/year and Monthly/Yearly changes.
- **Location:** `mobile-app/src/features/dashboard/dashboard-view.tsx`, `use-dashboard-report.ts`; Dashboard route `mobile-app/src/app/(app)/(tabs)/index.tsx`; optional new feature-local skeleton component.
- **Changes:** Replace the loading sentence with layout-matched summary, checks and chart placeholders. Derive readiness from current Space/report state, including initial Spaces loading. Keep controls and headings stable, retain scoped date-picker metadata if required, and allow rapid selection changes. Separate missing-data skeleton state from refresh-control state. Surface initial Spaces failures with retry rather than an endless placeholder.
- **Verification:** Slow the report request and exercise all 1/3/6-month ranges, Monthly/Yearly in both directions and selectable years. Resolve requests out of order and confirm only the latest selection renders. Verify empty reports, failures/retry and refresh with existing data.

### Task 3: Bottom-tab destination loading
- **Goal:** Matching skeletons for pending destination data while preserving immediate revisits.
- **Location:** `mobile-app/src/features/expenses/browse-view.tsx`, `mobile-app/src/features/categories/budget-list-view.tsx`, `mobile-app/src/app/(app)/(tabs)/budget.tsx`, `mobile-app/src/app/(app)/(tabs)/profile.tsx`; controller changes only where required to expose readiness; tab routes for focus/activity inputs.
- **Changes:** Expenses: placeholder total/count plus a small fixed set of Category/description/amount/date rows in the existing list structure. Budget: placeholder total/metadata and Category/budget rows. Profile: skeleton identity only while Clerk is unresolved and Shared Space section only during initial Spaces load; keep Appearance and available actions visible. Gate no-Shared-Space copy on completed loading, and show a retryable failure when resolution fails. Account for initial Spaces loading and errors in Expenses/Budget. Keep completed content on refresh, current filters, scroll position and mounted tab state. Keep the bottom bar available throughout.
- **Verification:** Cold-visit every tab with delayed data; then revisit loaded tabs. Rapidly alternate tabs, switch Spaces, retry failures and test successful empty results. Verify no unnecessary skeleton flash or reset of filters/scroll, and that Add/navigation remain tappable. Profile must not flash a missing-membership message while loading.

### Task 4: Focused regression and native validation
- **Goal:** Verify behavior without building a broad snapshot-test suite.
- **Location:** Existing `mobile-app/src/features/dashboard/use-dashboard-report.test.mjs` and relevant existing workflow tests if controller behavior changes; native runbook `docs/local-testing.md`.
- **Changes:** Extend deferred-response tests only for changed core controller behavior: selected query, obsolete response rejection, retained picker metadata and scope reset. Reuse existing request isolation coverage. Validate visual layouts manually in the native development client.
- **Verification:** From `mobile-app`, run `npm run typecheck`, `npm run lint` and `npm test`. Record native Android/iOS checks separately from automated results; if a platform/device is unavailable, state that explicitly.

Dependencies: Task 1 precedes Tasks 2–3; Task 4 validates the integrated result.

## 5. Testing and Validation
- Native matrix: light/dark, large text, reduced motion, TalkBack/VoiceOver, cold tab entry, loaded revisit, rapid tab/period selection, initial Spaces load, Space switch, request error/retry, legitimate empty response, pull refresh and app background/resume.
- Check that skeletons appear on the first pending render, occupy a representative footprint, disappear immediately when data is ready, and never cover the bottom navigation or remain after terminal failure.
- No new tests for static rectangle dimensions. Add focused controller assertions only where readiness/metadata logic changes.

## 6. Acceptance Criteria
- Dashboard period changes visibly select the new option immediately and display placeholders until the matching report is ready.
- All four bottom-tab destinations show appropriate pending regions when required; loaded revisits remain immediate with existing content.
- No false zero totals, no-data messages, or previous-Space/previous-period reports appear during unresolved loading.
- Existing refresh, retry, empty states, filters, scroll restoration and navigation continue working.
- Skeletons use the current design system, remain accessible and respect reduced motion; inactive destinations do not continuously animate.
- Extra suggestions below remain unimplemented unless separately approved.

## 7. Assumptions and Additional Suggestions
- Assumption: “whenever appropriate” means missing data uses skeletons; loaded tab revisits do not receive a forced skeleton animation. Confirmation of this plan approves only Tasks 1–4.
- **Expense details:** `mobile-app/src/features/expenses/detail-view.tsx` currently shows a loading sentence. A field-shaped skeleton would make opening an Expense feel more immediate.
- **Category/Budget editor:** `mobile-app/src/features/categories/category-configuration-view.tsx` currently shows a loading sentence. Placeholder form rows could preserve the editor layout until its draft is ready.
- **Statement Import history and details:** `mobile-app/src/features/statement-import-history/statement-import-history-view.tsx` and `statement-import-detail-view.tsx` could show row and summary placeholders instead of loading text.
- **Import entry recent statements:** `mobile-app/src/app/(app)/import-statement.tsx` could reserve recent-statement rows while history loads.
- **Category pickers/review catalog:** `mobile-app/src/features/expenses/manual-view.tsx` and `mobile-app/src/features/statement-import/review-view.tsx` could show placeholders only in catalog-dependent regions while keeping entered/reviewed data visible.
- Keep actual PDF extraction and import confirmation as meaningful progress/busy states, since these represent work rather than a missing content layout.

## References
- [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) — installed SDK baseline.
- [Expo Router tabs](https://docs.expo.dev/router/advanced/tabs/) — navigation overview; installed Router implementation is the authority for version-specific props. No navigation API changes are planned.
- [React Native accessibility](https://reactnative.dev/docs/accessibility) — loading/busy semantics and hiding decorative descendants.
- [Reanimated reduced motion](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/) — respect the user's motion preference with static placeholders.
