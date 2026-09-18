# Architecture

Spendeazy uses vertical slices. [`CONTEXT.md`](../CONTEXT.md) defines domain language; this document defines code placement and dependency direction.

## Dependency direction

```text
src/App.tsx and application composition
  -> src/features/<feature>/index.ts
    -> feature-private UI, queries, services, read models, and behavior
  -> src/shared/*
  -> src/components/ui/*
```

Dependencies point down this diagram. A feature never imports another feature. Application composition connects features through their public root interfaces.

## Placement

| Location                 | Owns                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/<feature>` | Everything specific to one user capability, including its endpoint adapter, query keys, read models, behavior, and presentation. |
| `src/shared`             | Domain or infrastructure code with concrete leverage across multiple features.                                                   |
| `src/components/ui`      | Generic design-system primitives.                                                                                                |
| `src/components/app`     | Application-wide composition UI such as authentication boundaries, navigation, and route data states.                            |
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

## Shared boundaries

The important shared seams are:

- `shared/api`: validated configuration, authenticated user scope, HTTP transport, cancellation, response validation, and structured errors. Endpoint-specific adapters stay in features.
- `shared/category`, `shared/account`, and `shared/transaction`: domain identity or projections used by multiple features. Feature-specific Budget and Transaction behavior stays with its feature.
- `shared/money`: currency formatting and exact cents arithmetic. It is not a currency-bearing Money value object; introduce one only when multi-currency behavior requires it.
- `shared/reporting-period`: one browser-local calendar-month selection and inclusive bounds shared by reporting features.
- `shared/query`: common cache, freshness, and retry policy.
- `shared/ui`: composed UI with proven cross-feature behavior. Generic primitives remain in `components/ui`.

The authenticated composition boundary owns the TanStack Query client and remounts it for each Clerk user so cached financial data cannot cross an account switch. Route queries load on demand.

## Decision rules

Use these rules when a placement choice is unclear:

- Prefer feature ownership over a shared API-shaped repository. Share transport mechanics, not endpoint contracts.
- Prefer separate task-specific views over a broadly configurable shared component. Share lower-level primitives and stable projections.
- Prefer current, named multi-feature callers over hypothetical reuse when creating a shared module.
- Prefer a feature-root interface over imports from feature internals; the root is the feature's integration and test seam.
- Keep layout, routing, authentication boundaries, navigation, and provider lifecycle in application composition.

## Change checklist

For feature creation or structural refactoring:

1. Use the capability name from `CONTEXT.md`; update the glossary only after resolving a new domain term.
2. Put capability-specific code in `src/features/<feature>` and export the smallest useful interface from its root `index.ts`.
3. Preserve the dependency direction and the `page -> query -> service -> API client` boundary where applicable.
4. Before sharing code, name its current callers and apply the deletion test: removing it should scatter meaningful logic.
5. Update `eslint.config.js` when a new architectural seam needs executable enforcement.
6. Run `npm run lint`, `npm run build`, and `npm test`. For authenticated financial flows, also record the relevant live API or browser validation.

The change is complete when the new behavior respects feature-root imports, no feature or shared module depends on a feature, transport records stop at service adapters, and the required automated and live checks pass.

## Enforcement

`eslint.config.js` is the executable source of truth for import boundaries. It enforces that:

- imports from outside a feature use `@/features/<feature>` rather than a feature-internal path;
- code in `src/features` and `src/shared` does not import a feature module.

Update the lint rules and this document together when dependency boundaries change.
