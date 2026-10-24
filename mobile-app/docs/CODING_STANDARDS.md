# Mobile coding standards

Apply when creating, changing, or reviewing mobile code. These are adopted design constraints, not a claim that the existing app already follows them. Apply them to new features and changed workflows; keep migration of unrelated code separate from the task.

## Responsibility and dependencies

Keep presentation separate from application workflows. The mobile app still owns the on-device behavior assigned by the [client/server responsibilities](../../README.md#responsibilities); this standard defines its internal organization.

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

## Behavioral ownership

- A form preparation operation returns either field issues or normalized input, so callers can submit without knowing a required sequence of validation helpers. Supply the clock and relevant Category eligibility as inputs. Server authorization and save-time enforcement remain governed by the [Expense contract](../../docs/specifications/mobile-expense-domain-api.md).
- Centralize application reactions to session expiry, explicit sign-out, identity changes and Space changes, including consistent handling of request failures. Controllers and stores follow the retention/reset policy in [mobile guidance](../AGENTS.md#api-and-identity-boundaries).
- Translate expected failures into feature state at the controller interface. Preserve user work according to the owning workflow and distinguish transport failures from invalid responses. Views render the resulting issues and recovery actions.

## Review and verification

### Current application owners and migration gaps

- `src/application/session.ts` owns expiry, explicit sign-out, identity/Clerk-session changes, Space changes and retained manual Expense work. `session-runtime.ts` binds the single application instance to React; `authorized-client.ts` is its Clerk adapter. Controllers use these interfaces rather than interpreting HTTP 401 or matching error messages.
- `src/api/request-failure.ts` classifies missing credentials, expiry, transport, invalid-response and application rejection failures. `session-request.ts` rejects obsolete successes and failures before initiating recovery. API adapters decode external data before returning it.
- `src/application/spaces/` owns Space loading, authorized selection and ordered device-memory writes. `src/features/expenses/` owns manual submission, Categories, browse state and detail controllers, with views driven by controller results and route-owned navigation callbacks.
- The parser proof and existing Profile/Appearance presentation have not been reorganized into production feature modules. Expense editing/deletion, Budget, reporting, Statement Import and sharing remain future workflows. Their state and async operations must join the owning capabilities as implemented; this migration does not certify native-device behavior.

For each changed workflow, verify responsibility ownership and dependency direction against the table. Every view must be renderable from supplied feature state without a live backend or authenticated session; theme/layout context remains appropriate. Import restrictions can enforce these dependencies when introduced; their enforcement is not currently claimed by this document.

Test observable rules and workflow outcomes through the owning module's interface. For affected async flows, cover obsolete completions, retry, refresh during pagination, repeated save and identity/Space changes. View checks cover rendering, user intent and accessibility rather than duplicating business-rule tests. Keep test dependencies injectable at existing seams and avoid assertions about private state or mocked call choreography.

Use [mobile checks](../AGENTS.md#commands) and [repository validation and delivery](../../AGENTS.md#workflow) for execution requirements. Record remaining migration gaps explicitly; documentation, unit tests and static checks do not establish native-device acceptance.
