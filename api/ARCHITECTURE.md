# Architecture

Read this document before changing module boundaries, dependency direction, persistence seams, request-wide behavior, or cross-feature workflows. Use [root CONTEXT.md](../CONTEXT.md) for domain language, `docs/adr/` for API decisions, and `docs/DATABASE_DESIGN.md` for the persistence overview and schema sources. Paths are relative to `api/`; the [root integration overview](../README.md) describes the web/API boundary.

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

The business features are `users`, `categories`, `category-rules`, `transactions`, and `statement-imports`. A feature normally contains:

- `presentation/`: controllers, request/response DTOs, and HTTP mapping.
- `application/`: use-case services, errors, records and inputs, and store ports.
- `infrastructure/`: TypeORM adapters implementing application ports.
- `<feature>.module.ts`: dependency wiring.

Keep a capability with the feature that owns its meaning. A feature may define a narrow read port for data owned elsewhere when that capability is specific to its workflow; for example, transaction categorization and category-rule validation use feature-owned category ports. This avoids coupling application services to another feature's adapter or to TypeORM.

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

`configureApp` defines the global order and contract:

1. Request correlation generates an `X-Request-ID`, then Express parsers apply body-size limits while preserving raw input handling.
2. Nest validation transforms DTOs, strips no unknown fields silently, and converts failures to `RequestValidationError`.
3. `ClerkAuthenticationGuard` verifies the bearer session unless the route is public.
4. `ProvisionedUserGuard` resolves the Clerk identity to the local `User` and places its ID on the request. `PUT /api/v1/users/me` is the provisioning exception.
5. `JsonContractGuard` enforces the JSON transport contract.
6. A feature controller obtains the authenticated local User ID, maps the DTO, and calls an application service. Space-aware features must pass that trusted ID through the reusable `SpaceAccessService`; a client-supplied Space ID is only a lookup key and never an ownership grant.
7. `ApiExceptionFilter` translates application, HTTP, parser, and database failures to the common error envelope.

Health and documentation routes are public and excluded from the `/api/v1` prefix. Financial features expose authorized Space routes, and the older `/users/me` routes must resolve the authenticated User's Personal Space before calling Space-scoped application methods. Space IDs in requests are lookup keys; the authenticated membership determines access. Persistence still carries legacy `user_id` columns and User-scoped service methods, so removing that unused compatibility code remains a release gate. Cross-feature references are constrained by Space, while actor columns preserve Transaction and Statement Import attribution.

## Persistence and transactions

Each feature's application layer owns small, capability-specific store interfaces and injection tokens. TypeORM adapters map between database entities and application records. Keep TypeORM types and query details out of controllers and application services.

The database schema is managed by explicit migrations. Entities describe the runtime mapping; migrations remain the authoritative history of schema changes. Preserve user ownership in both queries and relational constraints.

Use the injected feature store for work contained within one persistence seam. A workflow that must coordinate multiple feature-owned stores atomically owns a narrow application-facing unit-of-work port in its feature application layer. Statement Import confirmation's context exposes only User lookup by ID, Category lookup by User and ID, Statement Import file-hash lookup and creation, and imported Transaction fingerprint lookup and creation. It does not expose `EntityManager` or the unrelated methods of those feature stores. The TypeORM unit-of-work implementation remains in persistence infrastructure, where it creates all participating adapters from one transaction-bound `EntityManager`; every read and write in the workflow must use the supplied context. Statement import confirmation is the reference implementation.

Add a store to an atomic workflow context only for a real cross-feature workflow, and expose only the operations that workflow uses. Keep each port owned by its feature and each adapter feature-local.

## Errors and contracts

Expected failures are application errors with stable codes. Application services raise them; `ApiExceptionFilter` owns HTTP status and envelope translation. Infrastructure adapters may translate database-specific failures into application errors when they can identify the business meaning precisely. Unrecognized database and programming failures remain internal errors.

DTO validation protects the transport boundary. Application services still validate invariants that must hold regardless of caller. Monetary amounts cross API and application boundaries as normalized decimal strings, not floating-point numbers. Domain dates use `YYYY-MM-DD` strings where time-of-day has no meaning.

OpenAPI assembly lives under `src/docs/`. When an endpoint contract changes, update its DTO/controller metadata and the associated contract tests.

## Change placement

When adding behavior:

1. Identify the owning feature using the vocabulary in root `CONTEXT.md`.
2. Put orchestration and business rules in an application service or a focused pure helper beside it.
3. Express required persistence as a narrow application-owned port.
4. Implement that port in the feature's infrastructure layer and bind it in the feature module.
5. Keep the controller limited to authenticated context, transport mapping, and response semantics.
6. Use the unit of work only when the complete operation must commit or roll back across stores.
7. Test pure rules and services with fakes, adapters against a database-capable test setup, controllers at the HTTP boundary, and critical assembled flows in `test/`.

A change is architecturally complete when dependency direction remains inward, every write is scoped to the authenticated user, atomic work uses one transaction context, expected failures retain stable public codes, and affected unit, controller, adapter, and end-to-end contracts pass.

## Decision records

`docs/adr/0001-place-feature-owned-persistence-seams.md` establishes the vertical-module and unit-of-work design. Record a new ADR when changing a durable boundary or reversing that decision; update this overview after the decision is accepted. Do not use this file as a substitute for the rationale in an ADR.
