# Architecture

The Spendeazy web project uses vertical slices. [Root GLOSSARY.md](../../GLOSSARY.md) defines shared domain language; this document defines web code placement and dependency direction. Paths are relative to `web/`. See the [root integration overview](../../README.md) for the boundary with the API.

## Dependency direction

```text
src/App.tsx and application composition
  -> src/features/<feature>/index.ts
    -> feature-private UI, queries, services, read models, and behavior
  -> src/shared/*
  -> src/components/ui/*
```

Dependencies point down this diagram. A feature never imports another feature. Application composition connects features through their public root interfaces. Features and shared modules do not import application composition (`components/app`, `layouts`, `pages`, `App.tsx`, or `main.tsx`); reusable presentation belongs in `shared/ui`.

## Placement

| Location                 | Owns                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/<feature>` | Everything specific to one user capability, including its endpoint adapter, query keys, read models, behavior, and presentation. |
| `src/shared`             | Domain or infrastructure code with concrete leverage across multiple features.                                                   |
| `src/components/ui`      | Generic design-system primitives.                                                                                                |
| `src/components/app`     | Application-wide composition UI such as authentication boundaries, navigation, and route loading.                               |
| `src/layouts`            | Application page structure.                                                                                                      |
| `src/pages`              | Route-level pages that are not business capabilities, such as Not Found.                                                         |
| `src/App.tsx`            | Composition root: routing, layouts, providers, and feature assembly.                                                             |

Keep small or coincidentally similar code in its owning feature. Move code to `src/shared` only when removing the shared module would scatter meaningful logic across multiple current callers. Cross-cutting infrastructure required by every authenticated feature may begin at the composition seam before every feature adopts it.

## Feature contract

Each feature exposes its smallest useful public interface from `src/features/<feature>/index.ts`; route-owned features currently export their page. Feature implementation uses relative imports. External callers import only `@/features/<feature>`.

Within an endpoint-backed feature:

```text
page -> query hook -> service/endpoint adapter -> shared API client
```

- The service validates transport data and projects it into a feature-owned read model.
- The page consumes the query hook, never an API transport record.
- The feature owns its endpoint contract, query keys, read model, and presentation.
- The API is the runtime source of financial data.

Dashboard, Transactions, and Categories may project the same underlying data differently because they serve different user tasks. Share stable domain identity and repeated projection logic; keep task-specific queries and presentation inside the feature.

## Task entry points

Paths are relative to `web/`. Feature `index.ts` files remain the public integration boundary; the links below locate private implementation for changes within that feature. Neighboring `*.test.ts(x)` files cover each seam.

| Task | Start here | Behavior / endpoint adapter | API owner / browser acceptance |
| --- | --- | --- | --- |
| Statement Import | [Page](../src/features/statement-import/statement-import-page.tsx) | [Workflow hook](../src/features/statement-import/use-statement-import-workflow.ts), [workflow state](../src/features/statement-import/statement-import-workflow.ts), [service](../src/features/statement-import/statement-import-service.ts) | [Statement Imports](../../api/src/statement-imports/); [complete journey](../e2e/spending-journey.spec.ts) |
| PDF extraction and reconciliation | [Parser dispatch](../src/features/statement-import/statement-parser/transformer.ts) | [PDF extractor](../src/features/statement-import/statement-parser/pdf-extractor.ts), provider transformers in the same directory | Browser-owned; [fictional PDF fixtures](../e2e/fixtures/README.md) |
| Sharing and Space selection | [Sharing page](../src/features/invitations/sharing-page.tsx), [Space switcher](../src/components/app/space-switcher.tsx) | [Invitation adapter](../src/features/invitations/invitations-service.ts), [Space catalog](../src/shared/api/space.ts), [selection](../src/components/app/space-selection.ts) | [Invitations](../../api/src/invitations/), [Spaces](../../api/src/spaces/); [sharing journey](../e2e/sharing-themes.spec.ts) |
| Reporting and Budget status | [Dashboard adapter](../src/features/dashboard/dashboard-service.ts), [Insights adapter](../src/features/insights/insights-service.ts) | [Reporting Period](../src/shared/reporting-period/), [Budget status](../src/shared/budget/); Budget editing in [Categories adapter](../src/features/categories/categories-service.ts) | [Transactions](../../api/src/transactions/), [Categories](../../api/src/categories/); [Dashboard](../e2e/dashboard-summary.spec.ts), [Insights actions](../e2e/monthly-insights-actions.spec.ts) |

API service, persistence, and integration-test owners are in the [API task map](../../api/ARCHITECTURE.md#task-entry-points).

## Shared boundaries

The important shared seams are:

- `shared/api`: validated configuration, authenticated user scope, HTTP transport, cancellation, response validation, and structured errors. Endpoint-specific adapters stay in features.
- `shared/category`, `shared/account`, and `shared/transaction`: domain identity or projections used by multiple features. Feature-specific Budget and Transaction behavior stays with its feature.
- `shared/money`: currency formatting and exact cents arithmetic. It is not a currency-bearing Money value object; introduce one only when multi-currency behavior requires it.
- `shared/budget`: exact monthly Budget status and amount descriptions used by Dashboard attention, Category summaries, and Insights chart details. Feature queries and Budget editing remain feature-owned.
- `shared/reporting-period`: one browser-local calendar-month selection and inclusive bounds shared by reporting features.
- `shared/query`: common cache, freshness, and retry policy.
- `shared/ui`: composed UI with proven cross-feature behavior, including feature loading/error/empty states, authentication loading presentation, and branding. Authentication lifecycle stays in application composition; generic primitives remain in `components/ui`. Application composition marks its scrolling pane with `data-page-scroll-host`; shared page-scroll operations capture and restore phone-window and desktop-pane positions without feature code depending on the shell DOM hierarchy. Theme and Appearance use the same layout-change operation to preserve offsets through font loading and delayed browser anchoring; the next interaction releases suppression, and later intentional scrolling is retained.

The authenticated composition boundary owns the TanStack Query client and remounts it for each session identity so cached financial data cannot cross a session switch. Route queries load on demand.

## Decision rules

Use these rules when a placement choice is unclear:

- Prefer feature ownership over a shared API-shaped repository. Share transport mechanics, not endpoint contracts.
- Prefer separate task-specific views over a broadly configurable shared component. Share lower-level primitives and stable projections.
- Prefer current, named multi-feature callers over hypothetical reuse when creating a shared module.
- Prefer a feature-root interface over imports from feature internals; the root is the feature's integration and test seam.
- Keep layout, routing, authentication boundaries, navigation, and provider lifecycle in application composition.

## Change checklist

For feature creation or structural refactoring:

1. Use the capability name from root `GLOSSARY.md`; update the glossary only after resolving a new domain term.
2. Put capability-specific code in `src/features/<feature>` and export the smallest useful interface from its root `index.ts`.
3. Preserve the dependency direction and the `page -> query -> service -> API client` boundary where applicable.
4. Before sharing code, name its current callers and apply the deletion test: removing it should scatter meaningful logic.
5. Update `eslint.config.js` when a new architectural seam needs executable enforcement.
6. Run `npm run lint`, `npm run build`, and `npm test`. For authenticated financial flows, also record the relevant live API or browser validation.

The change is complete when external callers respect feature-root imports, features use relative imports for their own implementation, features and shared modules respect dependency direction, transport records stop at service adapters, and the required automated and live checks pass.

## Enforcement

`eslint.config.js` enables the dependency rule in `eslint/architecture.js`. It checks static imports, re-exports, literal dynamic imports, and TypeScript import types, resolving aliases and relative paths before enforcing that:

- imports from outside a feature use `@/features/<feature>` rather than a feature-internal path;
- a feature uses relative imports for its own implementation and cannot import another feature;
- shared modules cannot import features;
- features and shared modules cannot import application composition.

Colocated tests follow the same rules and can exercise their feature's private implementation. Computed dynamic import paths cannot be resolved by this rule; use literal paths for application modules so the dependency remains checkable. The fixture matrix in `eslint/architecture.test.js` tests the configured rule through ESLint.

Update the lint rules and this document together when dependency boundaries change.
