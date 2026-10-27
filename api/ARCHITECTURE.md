# Architecture

This guide describes the current API implementation and code placement/dependency rules. Paths are relative to `api/`. Use the task map to locate owners; read the affected boundary sections and relevant [ADRs](docs/adr/). [Database design](docs/DATABASE_DESIGN.md) owns current schema relationships. The saved-resource schema and routes use Expense terminology; parsed statement Transactions remain client-side evidence. The broader [mobile Expense contract](../docs/specifications/mobile-expense-domain-api.md) is only partly implemented. The mobile app is an authenticated client for Spaces, Monthly/Yearly Dashboard reporting, manual Expense creation, active/deleted Expense browsing, revision-protected edits, soft deletion and per-Expense Activity.

## Task entry points

Start at the named owner, then follow its ports into infrastructure. Paths are relative to `api/`; neighboring `*.spec.ts` files cover application behavior, and `test/` covers HTTP and PostgreSQL integration.

| Task | Behavior owner | HTTP / persistence seam | Integration tests |
| --- | --- | --- | --- |
| Statement Import commit and duplicates | [Import service](src/statement-imports/application/statement-imports.service.ts) | [Space controller](src/statement-imports/presentation/space-statement-imports.controller.ts), [unit of work](src/database/unit-of-work.ts) | [HTTP contract](test/statement-imports.e2e-spec.ts), [rollback/duplicates](test/statement-import-rollback-postgres.e2e-spec.ts) |
| Space authorization and archive lifecycle | [Access service](src/spaces/application/space-access.service.ts), [lifecycle service](src/spaces/application/space-lifecycle.service.ts) | [Spaces controller](src/spaces/presentation/spaces.controller.ts), `src/spaces/infrastructure/` | [Space behavior](test/spaces.e2e-spec.ts), [PostgreSQL](test/spaces-postgres.e2e-spec.ts) |
| Invite Codes and joining | [Invitation service](src/invitations/application/invitations.service.ts) | [Controller](src/invitations/presentation/invitations.controller.ts), [atomic acceptance](src/invitations/infrastructure/typeorm-invitation-acceptance-store.ts) | [HTTP contract](test/invitations.e2e-spec.ts), [PostgreSQL](test/invitations-postgres.e2e-spec.ts) |
| Expense creation, revisioned edits, history and totals | [Expense service](src/expenses/application/expenses.service.ts) | [Space controller](src/expenses/presentation/space-expenses.controller.ts), Expense stores in `src/expenses/infrastructure/` | [Space Expense HTTP](test/space-expenses.e2e-spec.ts), [manual Expense HTTP/PostgreSQL](test/manual-expenses-http-postgres.e2e-spec.ts), [Space/PostgreSQL](test/spaces-postgres.e2e-spec.ts) |
| Category, Budget and Rule configuration | [Configuration service](src/categories/application/category-configurations.service.ts) | [Configuration store](src/categories/infrastructure/typeorm-category-configuration-store.ts), Category and Rule revisions | [HTTP/PostgreSQL](test/space-categories-http-postgres.e2e-spec.ts) |
| Imported Expense provenance | [Import service](src/statement-imports/application/statement-imports.service.ts) | [Space import controller](src/statement-imports/presentation/space-statement-imports.controller.ts), [unit of work](src/database/unit-of-work.ts) | [Import provenance/PostgreSQL](test/expense-statement-import-space-postgres.e2e-spec.ts), [rollback](test/statement-import-rollback-postgres.e2e-spec.ts) |
| Monthly/Yearly Dashboard reporting | [Dashboard report service](src/reporting/application/dashboard-report.service.ts), [repeatable-read store](src/reporting/infrastructure/typeorm-dashboard-report-store.ts) | [Space report controller](src/reporting/presentation/space-dashboard-report.controller.ts); the feature owns its read projection across Categories, Budgets, Expenses and imports | [Report rules](src/reporting/application/dashboard-report.service.spec.ts), [HTTP/PostgreSQL](test/dashboard-reporting-http-postgres.e2e-spec.ts) |
| Calendar Category summaries | [Category summary service](src/categories/application/category-summaries.service.ts) | [Space summary controller](src/categories/presentation/space-category-summaries.controller.ts); Budgets belong to Categories | [Category summaries](src/categories/application/category-summaries.service.spec.ts), Space Expense HTTP tests |
| Category Rule storage/replacement | [Rule service](src/category-rules/application/category-rules.service.ts) | `src/category-rules/presentation/`, `src/category-rules/infrastructure/`; the accepted target evaluates matching on-device | [PostgreSQL](test/category-rules-postgres.e2e-spec.ts), [storage ADR](docs/adr/0003-category-rule-storage-and-replacement.md) |
The mobile app signs in and calls the Space, Category and Expense APIs. Dashboard reporting uses `GET /api/v1/users/me/spaces/{spaceId}/reporting/dashboard`; its endpoint and response are defined by the [OpenAPI contract](docs/openapi.yaml). Manual Expense creation and the filterable Expenses list use the Expense client; Category, optional Budget and complete Rule drafts use the Category configuration client. Coordinate HTTP changes with the accepted [mobile Expense contract](../docs/specifications/mobile-expense-domain-api.md) and the mobile adapter.

## Shape

The Spendeazy API is a modular monolith built with NestJS and TypeORM. It exposes a versioned REST API and stores data in PostgreSQL. The code is organized primarily by feature under `src/`; shared technical concerns have their own top-level modules.

```text
HTTP request
  -> global parsing, validation, authentication, and provisioning
  -> feature controller (presentation)
  -> feature service (application)
  -> feature-owned store port
  -> TypeORM store adapter (infrastructure)
  -> PostgreSQL
```

Dependencies point inward within a feature:

```text
presentation -> application <- infrastructure
```

Application code defines the capabilities it needs. Infrastructure implements those capabilities. Controllers translate HTTP concerns and delegate; they do not contain business or persistence logic.

## Composition root

`src/main.ts` creates the application. `src/bootstrap.ts` installs request-wide HTTP behavior. `src/app.module.ts` composes authentication, database infrastructure, and feature modules.

Feature modules bind symbolic application tokens such as `USER_STORE` to concrete adapters such as `TypeOrmUserStore`. In the production composition, they register no database-backed controllers or services when `DATABASE_URL` is absent, allowing public health and documentation routes to start without a database. The offline OpenAPI composition may request a metadata-only registration from those same feature modules; this registers their presentation controllers with inert application-service tokens, but no persistence or authentication infrastructure, solely for contract scanning.

`AuthenticationModule` and `DatabaseModule` are global infrastructure modules. Treat global providers as exceptional: feature-specific capabilities belong in their feature module.

## Feature modules

The business features are `users`, `spaces`, `invitations`, `categories`, `category-rules`, `expenses`, `statement-imports`, and `reporting`. [The feature registry](src/api-feature-modules.ts) assembles them; `spaces` is composed through dependent feature modules. A feature normally contains:

- `presentation/`: controllers, request/response DTOs, and HTTP mapping.
- `application/`: use-case services and pure rule helpers, errors, records and inputs, and store ports.
- `infrastructure/`: TypeORM adapters implementing application ports.
- `<feature>.module.ts`: dependency wiring.

A feature may define a narrow read port for data owned elsewhere when that capability is specific to its workflow; for example, transaction categorization and category-rule validation use feature-owned category ports. This avoids coupling application services to another feature's adapter or to TypeORM.

Shared code exists only where the concern is genuinely cross-cutting:

- `authentication/`: Clerk token verification and local-user provisioning guards.
- `config/`: validated application configuration and HTTP constants.
- `database/`: connection setup, entities, migrations, development seeding, and the unit of work.
- `errors/`: the shared application-error contract and stable error codes.
- `http/`: transport-wide validation, routing, serialization helpers, and exception translation.
- `normalization/`: pure canonicalization used by more than one feature.
- `logging/`: allowlisted exception records, safe framework logging and asynchronous request correlation; see `docs/exception-logging.md`.
- `docs/` and `health/`: public operational endpoints.

## Request lifecycle

`configureApp` installs the request-wide contract:

- Request correlation generates an `X-Request-ID`, then Express parsers apply body-size limits while preserving raw input handling.
- Nest validation transforms DTOs, rejects unknown fields, and converts failures to `RequestValidationError`.
- `ClerkAuthenticationGuard` verifies the bearer session unless the route is public.
- Token verification checks the configured Clerk key, JWT signature, header type and validity window before accepting the User identity. The native-only API has no browser-origin allowlist; native sessions can omit `azp`. See [native session provenance](docs/adr/0004-native-clerk-session-provenance.md).
- `ProvisionedUserGuard` resolves the Clerk identity to the local `User` and places its ID on the request. `PUT /api/v1/users/me` is the provisioning exception.
- `JsonContractGuard` enforces the JSON transport contract.
- A feature controller obtains the authenticated local User ID, maps the DTO, and calls an application service. Space-aware features must pass that trusted ID through the reusable `SpaceAccessService`; a client-supplied Space ID is only a lookup key and never an ownership grant.
- `ApiExceptionFilter` translates application, HTTP, parser, and database failures to the common error envelope.

Health and documentation routes are public and excluded from the `/api/v1` prefix. Financial features expose authorized Space routes only; there are no Personal financial aliases. Space IDs in requests are lookup keys; authenticated membership determines access. Financial persistence stores ownership only by `space_id`; actor columns preserve Expense and Statement Import attribution. Cross-feature references are constrained by Space.

## Persistence and transactions

Financial writes preflight the destination Space and actor. Actor-attributed writes lock the acting User before any financial row is changed, matching the User-then-Space order used by Shared Space archiving and identity deletion. Database triggers take the Space row lock and recheck its status in the same transaction as each financial mutation, so a write either completes before archive or is rejected after it. Operations that check a Space-wide optimistic revision may take the exclusive Space lock before reading that revision. Do not combine a shared Space pre-lock with the triggers' exclusive lock: upgrading it can deadlock concurrent writes.

Each feature's application layer owns small, capability-specific store interfaces and injection tokens. TypeORM adapters map between database entities and application records. Keep TypeORM types and query details out of controllers and application services.

The database schema is managed by explicit migrations. Entities describe the runtime mapping; migrations remain the authoritative history of schema changes. Scope financial queries, uniqueness, and relational constraints by Space. Preserve User references only for membership, Personal Space ownership, and immutable actor attribution.

Use the injected feature store for work contained within one persistence seam. A workflow that must coordinate multiple feature-owned stores atomically owns a narrow application-facing unit-of-work port in its feature application layer. Statement Import confirmation's context exposes only User lookup by ID, membership locking for the destination Space, Category lookup by Space and ID, Statement Import file-hash lookup and creation, and imported Expense fingerprint lookup and creation. It does not expose `EntityManager` or unrelated store methods. The TypeORM unit-of-work implementation remains in persistence infrastructure, where it creates all participating adapters from one transaction-bound `EntityManager`; every read and write in the workflow uses the supplied context. Statement import confirmation is the reference implementation.

Add a store to an atomic workflow context only for a real cross-feature workflow, and expose only the operations that workflow uses. Keep each port owned by its feature and each adapter feature-local.

## Errors and contracts

For logging changes, follow the [safe logging policy](docs/exception-logging.md). Expected failures are application errors with stable codes. Application services raise them; `ApiExceptionFilter` owns HTTP status and envelope translation. Infrastructure adapters may translate database-specific failures into application errors when they can identify the business meaning precisely. Unrecognized database and programming failures remain internal errors.

DTO validation protects the transport boundary. Application services still validate invariants that must hold regardless of caller. Monetary amounts cross API and application boundaries as normalized decimal strings, not floating-point numbers. Domain dates use `YYYY-MM-DD` strings where time-of-day has no meaning.

OpenAPI assembly lives under `src/docs/`. Contract changes update DTO/controller metadata and contract tests, then follow [generation/checking](README.md#openapi-contract).

## Testing seams

Test pure rules and application services with fakes, adapters against a database-capable setup, controllers at the HTTP boundary, and critical assembled flows in `test/`.

Completion: inward dependencies; authorized Space-scoped writes with required actor attribution; one transaction context for atomic work; stable public error codes; passing affected unit, controller, adapter, and end-to-end contracts. [API guidance](AGENTS.md#validation) and root guidance own validation commands.

## Decision records

`docs/adr/0001-place-feature-owned-persistence-seams.md` establishes the vertical-module and unit-of-work design. Record a new ADR when changing a durable boundary or reversing that decision; update this overview after the decision is accepted. Do not use this file as a substitute for the rationale in an ADR.
