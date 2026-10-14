# Spec: Web code simplification

Date: 2026-10-13

Status: Approved. On 2026-10-13, the User approved this spec and explicitly
authorized implementation of all five proposals.

## Objective

Make the identified web code easier to understand and maintain while preserving
its observable behavior. Success means fewer duplicated decisions and clearer
separation of calculations, loading, and rendering, with unchanged financial
results, requests, error behavior, and browser interactions.

This is one review document with five independently verifiable refactoring
sections. It does not authorize a broad rewrite of the affected features.

## Scope and assumptions

- All five proposals from the simplification review are included.
- Implementation changes, if later authorized, are restricted to `web/`.
- Existing behavior is the baseline, including unusual but intentional branches.
  A suspected bug requires a separate decision rather than a correction hidden
  inside a refactor.
- Existing feature boundaries, public exports, HTTP contracts, dependencies,
  query policies, visible copy, and responsive layouts remain unchanged.
- This requested file is the spec artifact; creating GitHub issues is outside
  this request.

## Ownership and conventions

Paths below are relative to `web/` unless explicitly stated otherwise.

| Area | Source and verification owners |
| --- | --- |
| Budget loading decisions | `src/features/categories/edit-category-dialog.tsx`, `edit-category-row.tsx`, and `categories-queries.ts`; `categories-page.test.tsx` and `categories-queries.test.tsx` |
| Insights loading | `src/features/insights/insights-service.ts` and `insights-service.test.ts` |
| Suggestion feedback and Rule help | `src/features/statement-import/categorize-statement.tsx` and `categorize-statement.test.tsx` |
| Review calculations and table | `src/features/statement-import/review-statement.tsx` and `review-statement.test.tsx` |
| Browser acceptance | Existing `e2e/` suites for Categories, Insights, and Statement Import |
| Specification | `docs/specs/code-simplification.md` |

The existing stack is React, strict TypeScript, TanStack Query, Vitest, Testing
Library, and Playwright. Keep the installed project versions; no dependency
upgrade is required.

Follow [coding standards](../CODING_STANDARDS.md),
[dependency and placement rules](../ARCHITECTURE.md),
[web agent guidance](../../AGENTS.md), and the repository
[glossary](../../../GLOSSARY.md). New helpers and components belong to their
owning feature, use relative imports within that feature, and are not added to
feature root exports merely to support internal reuse.

Use descriptive names, explicit branches, narrow typed inputs, and existing
formatting. The current suggestion-copy helper demonstrates the preferred
branch style:

```ts
case "loading":
  return "Checking for a Category Suggestion…";
case "none":
  return "No Category Suggestion available. Choose a Category from the list.";
case "unavailable":
  return "Category Suggestion unavailable. Choose a Category from the list.";
```

## S1: Centralize Budget editor readiness

**Problem:** The dialog and inline Category editor repeat the same decisions
about authoritative Budget loading, errors, missing data, and readiness.

**Requirement:** Give this decision one feature-local authority. Keep the
dialog and table-row presentation distinct. The shared decision must not own
focus, dismissal, mutations, or form state.

**Acceptance criteria:**

- Both consumers use the same readiness decision.
- Before `isFetchedAfterMount`, an error shows the existing error message or
  fallback; otherwise loading is shown even when cached data exists.
- After `isFetchedAfterMount`, `undefined` data shows the existing fallback
  error. A Budget object or `null` data is ready. Do not introduce a new error
  priority when data exists alongside a query error.
- `null` remains the authoritative absence of a Budget; it is not loading.
- Query keys, Space scope, `refetchOnMount: "always"`, retries, and stale time
  remain unchanged.
- Ready editors preserve monthly and yearly Budget handling, partial-save
  recovery, navigation guards, and focus restoration.

**Evidence required:** A readiness-state matrix covers the branches above;
existing dialog and inline editing tests remain valid. Add missing cases for
cached data before the mount fetch and `null` versus `undefined` if not already
covered. Tests must verify behavior rather than the helper's implementation.

## S2: Deduplicate Insights loading and validation

**Problem:** Daily and monthly Insights repeat catalog and summary requests,
expense loading, response validation, and inactive-Category Budget loading.

**Requirement:** Extract the common sequence into a private loader with explicit
expense bounds. Keep daily and monthly report calculations separate and
retain their existing public signatures and result types.

**Acceptance criteria:**

- Catalog, selected-month summary, and expense loading still begin through
  the same concurrent request group.
- Daily loading retains the first rolling period's start date through the
  selected period's end date. Monthly loading retains an absent start bound so
  older recorded Expenses remain available.
- Pagination, paths, Space selection, and `AbortSignal` propagation are unchanged.
- Catalog and summary validation retain their order, labels, error types, and
  messages. Inactive-Category Budgets load after successful validation, as today.
- Daily and monthly outputs remain identical, including exact cents, zero-spend
  periods, strict Budget breaches, inactive Categories, and historical evidence.
- Do not replace the two report projections with a configurable report engine.

**Evidence required:** Existing Insights service tests pass unchanged. Verify
both date ranges, paginated loading, invalid responses, cancellation propagation,
and inactive-Category Budget failures; add focused cases where coverage is absent.

## S3: Make Category Suggestion feedback explicit

**Problem:** A nested ternary maps suggestion results to UI feedback, including
the case where suggested Categories are absent from the available options.

**Requirement:** Express this mapping through a small pure function with
explicit branches, using the existing suggestion and feedback types.

**Acceptance criteria:**

| Suggestion result | Available suggested options | Feedback |
| --- | --- | --- |
| No result | Any | `null` |
| `loading` | Any | `loading` |
| `unavailable` | Any | `unavailable` |
| `none` | Any | `none` |
| `suggested` | Zero | `none` |
| `suggested` | One or more | `null` |

- Suggestion order, eligibility, request limits, cancellation, caching, and late
  result handling are unchanged.
- Manual Category selection remains available in every feedback state.
- A suggestion remains an unsaved Manual draft until the User saves it.
- Feedback copy and mobile/desktop accessibility remain unchanged.

**Evidence required:** Cover the mapping table and retain the existing suggestion
UI tests, especially empty, unavailable, excluded-row, and obsolete-result cases.

## S4: Extract Category Rule help presentation

**Problem:** A dense inline renderer closes over editor state and renders Rule
explanations, match previews, and retry actions for mobile and desktop callers.

**Requirement:** Extract a feature-local presentation component with explicit
typed inputs. Keep Rule persistence and editor state with their current owners.
Do not combine the complete mobile and desktop editors.

**Acceptance criteria:**

- Equivalent-Rule copy, Exact/Contains explanations, match count, and preview
  order remain unchanged.
- The edited row's draft description is used as today. Excluded and already
  reviewed rows retain their preview annotations.
- Preview remains description matching only; it must not apply Categories or
  replace reviewed assignments.
- When remembering is enabled, desktop keeps its Apply & remember action;
  both layouts keep Retry and Apply without remembering when an error exists.
- Saving controls remain disabled while saving, and callbacks retain their
  existing order and number of invocations.
- Rules remain saved immediately before import confirmation. Applying without
  remembering does not undo a Rule that may already have been saved.

**Evidence required:** Existing Rule-preview, mobile/desktop, persistence-failure,
and retry tests remain valid. Add behavior coverage for any missing action-state
combination without weakening current assertions.

## S5: Separate Statement Review data and table rendering

**Problem:** Review mixes ordering, row grouping, summary calculations, Category
breakdown construction, and a nested desktop table renderer with page assembly.

**Requirement:** Extract pure Review data preparation and a feature-local
expense-table component. Keep page-level focus, scrolling, and confirmation
actions with the page. Keep extraction limited to these responsibilities.

**Acceptance criteria:**

- Sorting still uses `compareStatementRows` without mutating input Expenses.
  Included and excluded groups retain their chosen ordering.
- Unmapped, Ambiguous, Rule, and Manual counts retain their current definitions.
  Excluded rows do not contribute to included totals or the Category breakdown.
- Preserve current arithmetic exactly: the included total sums absolute amounts
  in cents; Category totals use the existing absolute-number accumulation.
  Unifying these arithmetic paths is outside scope.
- Average, shares, categorized total, largest Category amount, equal-amount
  ordering, and zero-row behavior remain unchanged.
- Category labels retain the Unknown Category fallback and Category Colors
  retain their current fallback behavior.
- Both table instances keep their captions, row keys, activity-description IDs,
  positive displayed amounts, exclusion styling, and assignment indicators.
- Mobile presentation, heading focus, scroll reset, duplicate warnings,
  inactive-Category conflicts, and confirmation blocking remain unchanged.

**Evidence required:** Existing Review tests remain valid. Cover empty input,
fractional amounts, mixed assignments, excluded payments, unknown Categories,
and sorting ties where existing tests leave gaps. Browser acceptance verifies
the journey from Categorize to Review and back.

## Validation commands

Run these from the repository root during a later authorized implementation.
Focused checks supplement the full completion gates.

```powershell
npm --prefix web test -- src/features/categories/categories-page.test.tsx src/features/categories/categories-queries.test.tsx
npm --prefix web test -- src/features/insights/insights-service.test.ts
npm --prefix web test -- src/features/statement-import/categorize-statement.test.tsx
npm --prefix web test -- src/features/statement-import/review-statement.test.tsx
npm --prefix web run lint
npm --prefix web run build
npm --prefix web test
npm --prefix web run typecheck:e2e
node scripts/local-test-launcher.mjs --e2e
```

New colocated tests must also run. Synthetic-suite prerequisites and focused
browser diagnostics are owned by repository
[local-testing guidance](../../../docs/local-testing.md).

## Boundaries and completion

- **Always:** Preserve behavior, keep helpers feature-local, retain existing
  assertions, verify error and edge cases, and make each refactoring reviewable.
- **Ask first:** Obtain explicit implementation consent. Seek a separate scope
  decision for behavior changes, new dependencies, API changes, or architectural
  boundary changes.
- **Never:** Change `api/`, redesign UI, weaken validation or safeguards, suppress
  failing checks, alter financial arithmetic, or include unrelated cleanup.

Spec delivery is complete when this file covers S1-S5 and is available for User
review. It is not evidence of passing implementation checks.

A later authorized implementation is complete only when the affected behavior
and all required checks pass, owning documentation is updated where needed,
and task-only changes are committed, pushed, verified remotely, and submitted
as a PR under the repository workflow. Report any blocked validation step.

## Approval and open questions

No product behavior questions remain for this spec. Exact private helper names
and file splits can be settled during a later approved planning phase.

The User approved the spec and authorized implementation. S1-S5 are independent
refactoring slices and will be verified in that order using the checks above.

## Implementation validation

Completed on 2026-10-13. S1-S5 are implemented with feature-local helpers and
components; the implementation map is recorded in `docs/ARCHITECTURE.md`.

- Web lint, production build, and browser-test type checking passed.
- The full Vitest suite passed: 706 tests across 66 files.
- The unfiltered isolated suite passed: 103 Playwright tests and 3 PostgreSQL
  Statement Import rollback/duplicate tests. The first attempt timed out during
  API startup before browser execution; the standalone retry passed.
- Independent code review found a remaining duplicate Budget readiness guard;
  it was removed, and the reviewer confirmed the finding was resolved.
- A temporary-copy mutation check inverted the fetched-after-mount condition;
  10 readiness assertions failed as expected. Production files were not mutated.

The build still reports a large Statement Import bundle. Bundle splitting is
outside this behavior-preserving refactor.
