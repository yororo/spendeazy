# Architecture

Web code uses vertical slices. Paths are relative to `web/`. This document owns code placement and dependencies; [root integration](../../README.md#integration-boundary) owns browser/server responsibilities. Use the task map first, then read the affected boundaries.

## Task entry points

Start at the owner below; neighboring `*.test.ts(x)` files cover each seam. These links locate private implementation for changes within a feature; external callers still use its root interface.

| Task | Start here | Behavior / endpoint adapter | API owner / browser acceptance |
| --- | --- | --- | --- |
| Statement Import | [Page](../src/features/statement-import/statement-import-page.tsx) | [Workflow hook](../src/features/statement-import/use-statement-import-workflow.ts), [workflow state](../src/features/statement-import/statement-import-workflow.ts), [service](../src/features/statement-import/statement-import-service.ts) | [Statement Imports](../../api/src/statement-imports/); [complete journey](../e2e/spending-journey.spec.ts) |
| PDF extraction and reconciliation | [Parser dispatch](../src/features/statement-import/statement-parser/transformer.ts) | [PDF extractor](../src/features/statement-import/statement-parser/pdf-extractor.ts), provider transformers in the same directory | Browser-owned; [fictional PDF fixtures](../e2e/fixtures/README.md) |
| Sharing and Space selection | [Sharing page](../src/features/invitations/sharing-page.tsx), [Space switcher](../src/components/app/space-switcher.tsx) | [Invitation adapter](../src/features/invitations/invitations-service.ts), [Space catalog](../src/shared/api/space.ts), [selection](../src/components/app/space-selection.ts) | [Invitations](../../api/src/invitations/), [Spaces](../../api/src/spaces/); [sharing journey](../e2e/sharing-themes.spec.ts) |
| Reporting and Budget status | [Dashboard adapter](../src/features/dashboard/dashboard-service.ts), [Insights adapter](../src/features/insights/insights-service.ts) | [Reporting Period](../src/shared/reporting-period/), [Budget status](../src/shared/budget/); Budget editing in [Categories adapter](../src/features/categories/categories-service.ts) | [Transactions](../../api/src/transactions/), [Categories](../../api/src/categories/); [Dashboard](../e2e/dashboard-summary.spec.ts), [Insights actions](../e2e/monthly-insights-actions.spec.ts) |
| Category Rule matching and editing | [Matching](../src/features/statement-import/category-rule-matching.ts), [categorizer](../src/features/statement-import/statement-categorizer.ts) | [Rule adapter](../src/features/categories/category-rules-service.ts), [editor](../src/features/categories/category-rules-dialog.tsx) | [Category Rules](../../api/src/category-rules/); [Remember](../e2e/statement-import-remember.spec.ts) |
| Manual Transactions and retained history | [Transactions page](../src/features/transactions/transactions-page.tsx) | [Adapter](../src/features/transactions/transactions-service.ts), [editor](../src/features/transactions/transaction-editor-dialog.tsx), [archived history](../src/features/transactions/archived-space-history-page.tsx) | [Transactions](../../api/src/transactions/); [history](../e2e/space-history.spec.ts) |
| Theme, Appearance, Settings | [Theme](../src/components/app/theme.ts), [Appearance](../src/components/app/appearance.ts) | [Sidebar](../src/components/app/primary-sidebar.tsx), [scroll operations](../src/shared/ui/page-scroll.ts) | Browser-owned; [Settings acceptance](../e2e/theme-settings.spec.ts) |
| Category Suggestions | [Coordinator](../src/features/statement-import/use-statement-category-suggestions.ts) | [Integration rules](../../docs/category-suggestions.md) | [Suggestion acceptance](../e2e/statement-import-category-suggestions.spec.ts) |

API service, persistence, and integration-test owners are in the [API task map](../../api/ARCHITECTURE.md#task-entry-points).

The [API route compatibility guide](../../api/docs/route-compatibility.md) records paired Personal aliases, explicit Space routes, and which first-party web adapters can still select an alias when no Space ID is supplied.

## Dependency direction

```text
src/App.tsx and application composition
  -> src/features/<feature>/index.ts
    -> feature-private UI, queries, services, read models, and behavior
  -> src/shared/*
  -> src/components/ui/*
```

- External callers import only `@/features/<feature>`; each feature exposes its smallest useful interface through `index.ts` (currently its page for route-owned features).
- Feature implementation uses relative imports and cannot import another feature. Application composition connects features through their root interfaces.
- Shared modules cannot import features. Features and shared modules cannot import application composition (`components/app`, `layouts`, `pages`, `App.tsx`, `main.tsx`).

## Placement

| Location | Owns |
| --- | --- |
| `src/features/<feature>` | One capability's UI, behavior, queries/keys, endpoint adapters, and read models |
| `src/shared` | Domain/infrastructure logic with meaningful reuse across current features |
| `src/components/ui` | Generic design-system primitives |
| `src/components/app` | Authentication boundaries, navigation, route loading, provider lifecycle |
| `src/layouts` | Application page structure |
| `src/pages` | Non-capability route pages, such as Not Found |
| `src/App.tsx` | Routing, layouts, providers, feature assembly |

Keep small or coincidentally similar code feature-local. Before sharing, name current callers: deleting the shared module should scatter meaningful logic. Cross-cutting infrastructure needed by every authenticated feature may begin at composition before all features adopt it. Prefer task-specific views to broadly configurable shared components; share stable identity, projections, and lower-level primitives.

## Feature contract

```text
page -> query hook -> service/endpoint adapter -> shared API client
```

The service validates transport data and projects feature-owned read models; pages consume query hooks rather than transport records. The API is the runtime source of financial data. Share transport mechanics, while keeping endpoint contracts and task-specific queries/presentation feature-owned. Dashboard, Transactions, and Categories can project the same data differently.

## Shared boundaries

| Module | Owns |
| --- | --- |
| `shared/api` | Validated configuration, authenticated user scope, HTTP transport/cancellation, response validation, structured errors |
| `shared/category`, `shared/account`, `shared/transaction` | Multi-feature domain identity/projections; task-specific behavior stays in features |
| `shared/money` | Currency formatting and exact cents arithmetic; add a currency-bearing value object only when multi-currency behavior requires it |
| `shared/budget` | Exact monthly Budget status and amount descriptions for Dashboard, Categories, Insights; queries/editing stay feature-owned |
| `shared/reporting-period` | One browser-local calendar-month selection and inclusive reporting bounds |
| `shared/query` | Common cache, freshness, retry policy |
| `shared/ui` | Proven shared presentation: loading/error/empty states, auth loading, branding; generic primitives stay in `components/ui` |

## Composition and scroll restoration

The authenticated composition owns TanStack Query and remounts its client for each session identity, preventing cached financial data crossing session switches. Route queries load on demand; authentication lifecycle stays in composition.

Composition marks its scrolling pane with `data-page-scroll-host`. [Shared scroll operations](../src/shared/ui/page-scroll.ts) capture/restore phone-window and desktop-pane offsets without feature code depending on the shell DOM hierarchy. Theme and Appearance use the same layout-change operation across font loading and delayed browser anchoring. [Design foundations](design-system/foundations.md#theme-and-appearance) owns the visible preservation/interaction behavior.

## Enforcement

`eslint.config.js` enables `eslint/architecture.js` to enforce the dependency rules above. It resolves aliases/relative paths in static imports, re-exports, literal dynamic imports, and TypeScript import types. Colocated tests follow the same rules and may exercise their own feature's private implementation. Computed dynamic paths cannot be checked; use literal paths for application modules.

Update the lint rule/configuration, its fixture matrix in `eslint/architecture.test.js`, and this document together when boundaries change. [Web guidance](../AGENTS.md#validation) owns validation commands; structural changes must preserve dependency direction and keep transport records at service adapters.
