# Category Suggestions integration

Read for changes to Category Suggestions, external financial-data processing, suggestion caching, or request limits. This reference owns the browser/API/TypeSafe integration; [root integration](../README.md#integration-boundary) owns general project responsibilities.

## Implementation entry points

| Boundary | Owner / coverage |
| --- | --- |
| Browser coordination, deduplication, cache, cancellation | [Coordinator](../web/src/features/statement-import/use-statement-category-suggestions.ts), [browser acceptance](../web/e2e/statement-import-category-suggestions.spec.ts) |
| Authorization, selection, validation | [Application service](../api/src/statement-imports/application/statement-category-suggestions.service.ts), [Space endpoint](../api/src/statement-imports/presentation/space-statement-imports.controller.ts) |
| External request and SDK limits | [Request builder](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-request.ts), [evaluator](../api/src/statement-imports/infrastructure/typesafe-category-suggestion-evaluator.ts) |
| Space-scoped history/catalog | [Catalog](../api/src/statement-imports/infrastructure/typeorm-statement-category-suggestion-catalog.ts), [PostgreSQL coverage](../api/test/statement-category-suggestions-postgres.e2e-spec.ts) |

## Flow and fallback

The optional Category Suggestion integration is called by the API during the Categorize stage. The browser requests suggestions for included Unmapped Transactions. Within a mounted browser coordinator, descriptions are deduplicated after trimming, collapsing whitespace, and ignoring letter case; the first description value is sent. Results are keyed in memory by destination Space, Category catalog, and normalized description. The API endpoint requires an authenticated User with write access to the route's destination Space, and the catalog and history queries use that same authorized Space.

Set the optional **TYPESAFE_API_KEY** in the API environment to enable TypeSafe requests. When the key is unset, a TypeSafe call fails, or its response fails validation, the endpoint returns zero suggestions and the ordinary Category selector remains available.

## Data sent to TypeSafe

The request builder sends these fields:

- The submitted Transaction description, trimmed by the API.
- Active Category IDs and names, plus each Category description when one is present.
- Up to 16 selected historical Transaction descriptions, each paired with its Category ID.

The TypeSafe request builder omits statement PDFs, amounts, dates, explicit User IDs, and explicit Space IDs. Category IDs are included as model choices and on selected examples. Descriptive text can still reveal financial activity even without those other fields.

The API considers at most 254 active Categories; the TypeSafe choice has 255 options including the no-category outcome. If the Space has no active Categories or exceeds that bound, it returns no suggestions. For context, the API reads at most the four most recent non-deleted Transactions per active Category, ordered by purchase date and then Transaction ID. The application then selects at most 16 relevant examples in total, with no more than one example per Category. Relevance comes from shared normalized description tokens, with rarer shared terms ranked more strongly. Only selected descriptions and Category IDs leave the API; the full Transaction history and the query's ordering dates are not sent.

The browser cache is in memory for one coordinator instance and has no time-based expiry. Repeated descriptions in that coordinator reuse a result; recreating it, changing Space, or changing the Category catalog can cause requests for those descriptions again. There is no API-side shared or persistent suggestion cache. Request count therefore follows the distinct included Unmapped descriptions presented within each coordinator and can rise when imports or catalog changes recreate it. This is an inference from request construction, not a measured latency or vendor-charge estimate; TypeSafe retention policies have not been verified.

## Validation and request limits

The TypeSafe question tells the model to treat all state text as untrusted data and ignore directions embedded in it. This is prompt guidance, not proof of prompt-injection prevention. The API accepts only a choice from the current Category IDs or the no-category outcome, validates the exact probability keys and distribution, applies its display thresholds, and rechecks each returned Category as active in the same Space. A suggestion never assigns a Category: the User chooses it during Categorize.

Each TypeSafe SDK request has a 2.5-second timeout and zero retries. The browser coordinator gives its API request a 10-second timeout and allows at most three concurrent suggestion requests per coordinator. These limits apply only to those SDK calls and that browser coordinator. The three-request cap is per coordinator, not an API-wide limit; neither limit establishes a global backend quota or bounds Space authorization, database work, or the full API HTTP request.
