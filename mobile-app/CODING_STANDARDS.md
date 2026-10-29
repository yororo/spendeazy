# Mobile coding standards

Apply when creating, changing, or reviewing mobile code. These are adopted design constraints, not a claim that the existing app already follows them. Apply them to new features and changed workflows; keep migration of unrelated code separate from the task.

## Responsibility and dependencies

Keep presentation separate from application workflows. 

| Role | Owns | Uses |
| --- | --- | --- |
| Route/container | Route parameters, feature composition, navigation | Controller hooks and views |
| Presentational view | Layout, styles, accessibility, animation, local visual interaction | Props, visual primitives, theme and layout hooks, presentation formatters |
| Feature controller hook | Requests, retries, submission, effect lifecycle, application capabilities and display state | Reducers, pure rules, adapters and shared application context |
| Reducer | Coordinated state transitions in response to events | Current state, event data and pure rules |
| Pure rules | Validation, normalization, calculations and eligibility | Explicit inputs |
| Adapter | HTTP, response decoding, device storage and native capabilities | External libraries and platform facilities |

- Views receive state and intent callbacks such as `onSave` or `onCategoryChange`. API calls, private-store mutations, session policy and financial decisions belong behind the controller interface. Views can keep sheet visibility, focus and animation state locally.
- Controllers expose meaningful actions and derived state rather than raw setters or transport details. Keep navigation in the route/container; report a successful workflow outcome for it to handle.
- Pure rules and reducers stay independent of React, routing, HTTP and device facilities. Supply time and other variable inputs explicitly.
- Decode external responses in adapters before returning application data. Share a decoder for an Expense between detail and page decoding; give distinct transport and application models explicit mappings where their responsibilities differ.
- Keep dependencies flowing toward rules; adapters and rules remain independent of views. Share application state through an owning provider/store with explicit identity, Space and reset semantics. Custom hooks share logic; multiple invocations do not implicitly share state.

## Reducer selection

Use a feature reducer when events coordinate several related values or workflow phases: filter changes resetting pagination, overlapping requests, multi-step import review, cancellation or recovery. A controller hook runs effects and dispatches their outcomes; the reducer determines the next state.

- Model events by intent or outcome, such as `filtersChanged`, `loadSucceeded` or `saveFailed`. Represent distinct phases explicitly, using a discriminated union when it excludes invalid state combinations.
- Reducers return the same result for the same state and event. Generate IDs, read clocks, call adapters and navigate outside the reducer.
- Give async operations an identity and relevant identity/Space/query scope. Accept completions only for the current operation. Define replacement versus append behavior, refresh/pagination coordination and repeated-submission behavior in one owning workflow.
- Use `useState` for independent local values and straightforward workflows. Static screens and visual primitives need only the roles their behavior requires; a reducer or controller hook is not mandatory for every module.

## Feature ownership

Co-locate a feature's view, controller, reducer, rules and tests when introducing or reorganizing that feature. Keep shared visual primitives in `src/components/` and Expo Router entries in `src/app/`. Give reusable logic an owner outside route files; avoid collecting unrelated application rules under `navigation/`.

Expose a small feature interface that hides its workflow details. Add separate modules where responsibilities or independent tests warrant them, rather than creating a file for every role in the table. The parser proof remains a feasibility experiment; production Statement Import code follows these constraints when implemented.

## Tests

Create unit tests only for the core features and not every single implementation. The goal is not to have a high test coverage but rather, few and high quality tests only.
