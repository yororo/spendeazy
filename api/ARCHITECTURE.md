# Architecture

Placement and dependency rules for the API. Paths are relative to `api/`. [Database design](docs/DATABASE_DESIGN.md) owns schema relationships. Saved resources use Expense terminology; parsed statement Transactions stay client-side evidence. Coordinate HTTP changes with the [OpenAPI contract](docs/openapi.yaml) and the accepted [cross-project Expense decision](../docs/adr/0004-mobile-expense-domain-and-contract.md).

## Task entry points

Start in the owning feature under `src/`. These responsibilities cross naming or feature boundaries:

| Task | Owner |
| --- | --- |
| Reviewed import coordination across Expenses, Categories, and Rules | `src/statement-imports/application/` |
| Space authorization and archive lifecycle | `src/spaces/application/` |
| Combined Category, Budget, and Rule configuration; calendar summaries | `src/categories/application/` |
| Account deletion, recovery, and identity fencing | `src/users/` |

## Shape

The API is a modular monolith: NestJS, TypeORM, a versioned REST surface, and PostgreSQL. Features live under `src/`. Shared technical concerns have their own top-level modules.

```text
HTTP request
  -> request-wide HTTP checks (see Request lifecycle)
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

Application code defines the capabilities it needs. Infrastructure implements them. Controllers translate HTTP and delegate. They do not contain business or persistence logic.

## Composition root

Start at `src/app.module.ts` for application composition. Feature modules bind application tokens to concrete adapters; feature-specific capabilities belong there.

With `DATABASE_URL` absent, feature modules register no database-backed controllers or services, so health and documentation routes can start without a database. The offline OpenAPI composition may request a metadata-only registration from those same modules: presentation controllers with inert application-service tokens, and no persistence or authentication infrastructure.

## Feature modules

A feature normally contains:

- `presentation/`: controllers, request/response DTOs, and HTTP mapping.
- `application/`: use-case services, pure rule helpers, errors, records, inputs, and store ports.
- `infrastructure/`: TypeORM adapters that implement application ports.
- `<feature>.module.ts`: dependency wiring.

A feature may define a narrow read port for data another feature owns when that read exists for its own workflow. Application services stay off other features' adapters and off TypeORM.

## Request lifecycle

`configureApp` in `src/bootstrap.ts` registers request-wide behavior. Middleware establishes correlation and parses bodies with size limits. Guards enforce Clerk authentication, local-user resolution, and the JSON transport contract. The active-identity interceptor wraps DTO validation and controller execution. Read the owning guard or interceptor before changing its checks.

- Health and documentation routes are public and excluded from the `/api/v1` prefix.
- The native-only API has no browser-origin allowlist. See [native session provenance](docs/adr/0004-native-clerk-session-provenance.md).
- `PUT /api/v1/users/me` is the provisioning exception. Account deletion fences old provider identities, including provisioning. Deletion DELETE and deletion-status GET bypass normal local-user resolution and verify the live initiating Clerk session in their service. Deletion requires background recovery independent of the client; see [recovery operation and checks](docs/LOCAL_TESTING.md#account-deletion-recovery).
- A controller uses the authenticated local User ID. Space-aware features pass that ID through `SpaceAccessService`. A client-supplied Space ID is a lookup key and never an ownership grant.
- Financial features expose authorized Space routes only, including Personal Spaces.
- Active-identity checks run through the Users execution port on one transaction-bound manager. Lock modes and isolation belong to its Users infrastructure implementation. Reviewed import preview and operation routes bypass this wrapper; their workflow owns transaction boundaries as described below.

## Persistence and transactions

Financial writes preflight the destination Space and the actor. Lock the acting User before any financial row, in the same User-then-Space order as Shared Space archiving and identity deletion. Database triggers take the Space row lock and recheck its status in the same transaction as each financial mutation. An operation that checks a Space-wide optimistic revision may take the exclusive Space lock before reading that revision. Do not combine a shared Space pre-lock with the triggers' exclusive lock: upgrading it can deadlock concurrent writes.

Each feature's application layer owns small store interfaces and injection tokens. TypeORM adapters map entities to application records. Keep TypeORM types and query details out of controllers and application services.

Explicit migrations are the schema history. Entities are the runtime mapping. Scope financial queries, uniqueness, and relational constraints by Space. Preserve User references only for membership, Personal Space ownership, and immutable actor attribution.

Use the injected feature store when the work stays inside one persistence seam. A workflow that must commit several feature-owned stores together owns a narrow unit-of-work port. That port does not expose `EntityManager`. The TypeORM implementation builds every participating adapter from the same transaction-bound manager. Add a store to that port only for a real cross-feature workflow, and expose only the operations that workflow uses.

Reviewed Statement Import uses this unit of work for atomic financial execution, with separate durable admission and recovery transactions. Each transaction checks the active actor. See [Statement Import persistence](docs/DATABASE_DESIGN.md#statement-imports) and the [OpenAPI contract](docs/openapi.yaml) for recovery and replay behavior, and [envelope evidence](docs/statement-import-envelope.md) for payload limits.

## Errors and contracts

Expected failures are application errors with stable codes. Application services raise them. `ApiExceptionFilter` owns HTTP status and the envelope. An infrastructure adapter may translate a database failure into an application error only when the business meaning is precise. Unrecognized database and programming failures stay internal. Logging follows [exception logging](docs/exception-logging.md).

DTO validation protects the transport boundary. Application services still validate invariants that must hold for every caller. Monetary amounts cross API and application boundaries as normalized decimal strings. Domain dates use `YYYY-MM-DD` where time of day has no meaning.

For contract changes, follow [generation and checking](README.md#openapi-contract).

## Testing seams

Test pure rules and application services with fakes, adapters against a database-capable setup, controllers at the HTTP boundary, and critical assembled flows in `test/`. Application tests live beside their implementation.

[API guidance](AGENTS.md#validation) owns validation commands and required checks.

## Decision records

[ADR 0001](docs/adr/0001-place-feature-owned-persistence-seams.md) establishes the vertical-module and unit-of-work design. Record a new ADR when changing a durable boundary or reversing that decision, then update this overview.
