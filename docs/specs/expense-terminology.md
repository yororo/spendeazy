# Expense terminology across Spendeazy

Status: Confirmed specification; implementation pending.
Date: 2026-10-15

## Problem Statement

Spendeazy describes itself as an expense tracker but uses Transactions for the positive spending Users record and analyze. The same word also describes parsed statement rows that can represent payments and credits. This inconsistent language appears in the browser, API, database, tests, and documentation, making it unclear what an Expense is and encouraging different names for the same domain concept.

## Solution

Use Expense consistently for positive spending, and Statement Entry for a parsed statement row. Apply these terms throughout the active product and its implementation while preserving existing financial behavior.

An **Expense** is positive spending on an Account, recorded manually or saved after confirmation through Statement Import. It may have a Category. A **Statement Entry** is a parsed row of account activity in a supported statement; it may represent spending, a payment, or a credit. Spending entries can become Expenses when confirmed. Parsing or reviewing an entry does not by itself create a saved Expense.

The application will use Expenses in navigation, pages, actions, history, and summaries. Expense API names and browser URLs replace their Transaction counterparts without aliases or redirects. A new database migration preserves existing data while renaming active expense-related schema objects. Current documentation adopts the same vocabulary; historical migrations and archived or superseded evidence retain their original wording.

## User Stories

1. As a User, I want navigation to say Expenses, so that the product's language matches the spending I manage.
2. As a User, I want the expense list and its empty, loading, and error states to use Expense terminology, so that the concept remains clear throughout the workflow.
3. As a User, I want to add an Expense manually, so that recording spending uses the same language as viewing it.
4. As a User, I want to edit an Expense using consistently named fields and actions, so that I understand which saved spending record I am changing.
5. As a User, I want to delete an Expense with clearly worded confirmation and feedback, so that I understand the action and its result.
6. As a User, I want filters, sorting, pagination, and counts to refer to Expenses, so that list controls describe their contents accurately.
7. As a User, I want Dashboard spending summaries and recent Expenses to use the same terminology, so that I can relate the overview to individual records.
8. As a User, I want Insights, Category summaries, and Budget views to refer to Expenses consistently, so that the same spending concept carries through analysis.
9. As a User, I want Personal and Shared Spaces to use the same Expense language, so that switching Spaces does not change the domain meaning.
10. As a Shared Space member, I want Added By attribution on Expenses to keep its existing meaning, so that I can identify who recorded spending without confusing that person with the payer.
11. As a former Shared Space member, I want historical Expenses and their activity to remain available under the new names, so that the rename does not remove read-only history.
12. As a User importing a statement, I want parsed rows called Statement Entries, so that a payment or credit is not presented as an Expense.
13. As a User importing a statement, I want spending entries to become Expenses only when confirmed, so that review state and saved spending remain distinct.
14. As a User importing a statement, I want payments and credits to retain their existing labels and reconciliation behavior, so that the rename does not alter statement totals.
15. As a User importing a statement, I want excluded entries to remain visible with their existing exclusion behavior, so that I can review activity that will not be saved as Expenses.
16. As a User importing a statement, I want Category assignments, confidence, suggestions, and bulk actions to use the appropriate entry or expense term, so that their scope is clear.
17. As a User importing a statement, I want duplicate warnings to preserve their existing meaning, so that renaming a record does not change which spending is flagged.
18. As a User, I want current links to open the Expenses page with existing filter behavior, so that navigation remains useful after the rename.
19. As an API consumer, I want expense resources, payloads, history, activity, and error identifiers to use the canonical language, so that integrations share the product's domain model.
20. As an API consumer, I want generated contract documentation to accurately describe the renamed interface, so that I can migrate to the breaking change.
21. As a maintainer, I want frontend and backend modules, types, and identifiers to reflect Expenses and Statement Entries, so that I do not need to translate between competing names.
22. As a maintainer, I want database tables, references, constraints, and indexes to reflect Expenses, so that persistence uses the same language as the application.
23. As a User with existing data, I want the migration to retain all Expenses, relationships, attribution, and history, so that the terminology change does not change my financial records.
24. As a maintainer, I want the glossary and current READMEs, architecture, and operational guidance to define and use the agreed terms, so that future work follows one domain model.
25. As a maintainer, I want historical migrations and archived decisions preserved, so that the repository retains an accurate record of how the system evolved.
26. As a maintainer, I want external-behavior tests to prove the rename and preserved invariants, so that the change is verifiable across the browser, API, and database.

## Implementation Decisions

- This is a terminology and contract change. Preserve calculations, monetary precision, date semantics, validation rules, categorization, reconciliation, import inclusion and exclusion rules, authorization, attribution, and persistence behavior. API and browser naming changes are the explicitly approved behavioral exceptions.
- Expense replaces Transaction as the canonical domain term for saved positive spending. Statement Entry names mixed parsed account activity. Use entry language for mixed collections and expense language for spending-specific projections; do not mechanically rename every parsed row to Expense.
- Preserve current intermediate amount representations. The domain definition of positive spending does not require changing parser or review sign conventions. Saved Expense amounts continue to satisfy existing positive-amount and decimal-precision requirements.
- Preserve current transfer handling. Some outgoing transfers remain spending candidates under existing rules; this change does not introduce a universal transfer, payment, or refund classification policy.
- Rename active browser feature modules, components, models, services, query keys, navigation, routes, links, visible copy, accessible names, errors, and related tests wherever they refer to the expense domain. Include dependent Dashboard, Insights, Categories, Budgets, Shared Space history, and Statement Import workflows.
- Use the Expenses browser route as the canonical replacement for the Transactions route. Remove the old route with no redirect or compatibility handler. New links preserve existing selection, filtering, and query-parameter behavior. Old bookmarks are intentionally unsupported.
- Rename backend expense modules, application ports, records, store adapters, entities, controllers, DTOs, and related identifiers. Preserve feature ownership, dependency direction, and atomic workflow boundaries.
- Replace transaction-domain HTTP resource names, path parameters, request and response fields, collection and count fields, schema names, operation identifiers, and domain error codes with expense names. Update all first-party consumers and generated contracts together.
- Statement Import commit requests and responses use expense terminology for spending being saved. Parsed Statement Entry terminology belongs to the temporary browser workflow, which continues to own PDF extraction and reconciliation; the API continues receiving JSON rather than PDFs.
- Remove legacy transaction-domain API routes and field aliases rather than accepting both vocabularies. Unknown old request fields remain subject to existing validation. Do not add dual response fields, fallback requests, or compatibility parsers for this rename.
- Preserve both existing Personal and explicit Space-scoped resource families under their new expense names. Removing transaction naming does not retire Personal route families for Expenses or unrelated resources. Preserve their existing authentication and Space authorization behavior.
- Treat this as an intentional breaking API change. Existing callers must update. Current compatibility guidance must explicitly describe this approved exception to legacy-name support; record the cross-project rationale in a new ADR rather than silently contradicting accepted guidance.
- Add a forward, data-preserving migration to rename expense tables, activity/history tables, foreign-key columns, and applicable named constraints, indexes, and sequences. The existing transaction and transaction-activity persistence models become expense and expense-activity models. Preserve historical migration files and migration tracking.
- Preserve record IDs, monetary values, dates, descriptions, Categories, Space ownership, Statement Import links, actor attribution, deletion retention, activity records, and referential constraints. Retain positive-amount, cross-Space reference, and duplicate-prevention guarantees.
- Preserve duplicate fingerprint and file-hash behavior. Do not change identity-producing values or algorithms merely because their implementation identifiers are renamed. Existing saved fingerprints must still match identical future imports.
- Inspect persisted activity snapshots and other structured stored metadata for domain names. Where stored keys require renaming, use an explicit data-preserving migration and retain the represented history. Historical descriptions and user-authored content are data, not targets for wording replacement.
- Update runtime mappings and queries to the renamed schema. Support both migration from a populated existing database and fresh installation through the complete historical migration chain. Include a reverse migration that restores names while retaining data, and document application-version requirements for rollback.
- Document coordinated database, API, and web rollout and rollback requirements. The existing deployment order alone does not guarantee compatibility during this breaking schema and contract change. Do not claim mixed old/new versions are supported.
- Update the shared glossary and all affected current READMEs, architecture documents, API/database guidance, testing guidance, and agent task maps. Review active design references, fixtures, and tooling for the same domain terminology where applicable.
- Define Expense and Statement Entry in the glossary without implementation details. Update dependent definitions such as Added By, Account, Category, Uncategorized, and import review states. Make Transaction an avoided synonym for Expense rather than a competing active domain definition.
- Choose entry-based wording for unmapped or excluded parsed rows. Distinguish a provider's transaction-history period or literal statement heading from the app's own canonical domain labels.
- Preserve technical uses of transaction for database atomicity and library APIs. Preserve literal provider text where parsing or reconciliation requires it, historical migration identifiers, and archived or superseded evidence. Explain permitted occurrences during the terminology audit instead of attempting a zero-occurrence text replacement.
- Record agreed breaking-change decisions in a cross-project ADR during implementation. The specification records intended behavior; it does not assert that the rename or migration has already shipped.

## Testing Decisions

- The User confirmed reuse of the existing isolated browser/API/PostgreSQL suite as the primary acceptance boundary, supplemented by focused HTTP contract and database migration checks. Reuse existing seams; introduce no new testing abstraction solely for this rename.
- Good tests exercise observable behavior and durable invariants. Avoid tests that merely mirror identifier replacements or bind to internal module arrangement.
- Extend existing browser journeys for manual expense creation, editing, deletion, filtering, navigation, Dashboard and Insights drill-through, Category/Budget views, Shared Space history, and statement review/confirmation. Assert Expense or Statement Entry terminology at meaningful interaction points and preserve existing financial outcomes.
- Verify the new browser route renders the expense workflow and app-generated links retain current filters. Verify the old browser URL no longer mounts that workflow and is not redirected to the new route.
- Extend existing API HTTP and OpenAPI contract tests to cover renamed resources, payloads, schemas, operation IDs, error identifiers, import commits, and history/activity endpoints in both Personal and explicit Space forms.
- Verify removed transaction-domain endpoints do not succeed as aliases, old request fields are not accepted as equivalent expense fields, and responses expose canonical names without legacy duplicates.
- Preserve existing unauthorized, cross-Space, archived-Space, invalid-amount, actor-attribution, and atomic rollback tests at the HTTP/PostgreSQL boundary. Assert their existing outcomes under renamed interfaces.
- Reuse populated-database migration test patterns to seed representative pre-rename data, run the forward migration, and verify exact value and identity preservation through the updated runtime. Cover imported and manual Expenses, activity history, retained deletions, Personal and Shared Spaces, and duplicate detection against pre-existing fingerprints.
- Verify renamed constraints still reject non-positive amounts and invalid cross-Space references. Verify both fresh migration-chain installation and reverse migration preserve schema usability and data at the appropriate application version.
- Retain existing parser, categorization, reconciliation, and import tests for spending, payments, credits, exclusions, and transfer handling. Rename fixtures or assertions only where needed; unchanged totals and included/excluded sets are regression evidence.
- Audit active source, generated contracts, current documentation, and app-owned labels for remaining transaction-domain terminology. Explicitly allow the technical, provider-literal, and historical exceptions described above.
- During implementation, run the web project's required lint, build, unit tests, and browser-test type checks; the API project's read-only lint, build, relevant unit and HTTP/PostgreSQL integration tests; and the root unfiltered isolated end-to-end suite. Regenerate and check the API contract using the established procedure. Skipped database suites do not count as passing coverage.
- This specification-only change requires document review and diff validation. The implementation gates above apply to the future product change; writing this spec does not constitute evidence that they passed.

## Out of Scope

- Changing financial calculations, amounts, validation rules, categorization, duplicate detection, import reconciliation, or inclusion/exclusion policies.
- Adding income, refund, payment, or transfer management, or expanding Expense to cover all account activity.
- Retaining old transaction-domain API aliases, JSON aliases, browser routes, or browser redirects.
- Retiring unrelated Personal compatibility routes or redesigning Space access.
- Rewriting historical migrations, archived evidence, superseded documents, user-authored descriptions, or provider text required by parsers.
- Renaming database/library transaction APIs or general technical references to atomic transactions.
- Reworking visual layouts, architecture, authentication, dependencies, or unrelated features beyond what the terminology change requires.
- Deploying the change or executing migrations against live data. Implementation supplies the migration and rollout documentation; production execution is separate.
- Implementing the product rename as part of the specification-writing task.

## Further Notes

- Tracking issue: [#118](https://github.com/yororo/spendeazy/issues/118), labeled `ready-for-agent`.
- These decisions were confirmed through the grill-with-docs interview. The User explicitly selected removal of old API names and browser URLs, with no compatibility support, while preserving migration history and active-domain data.
- The glossary's current Transaction definition already describes positive spending, and the database already enforces positive saved amounts. The main conceptual distinction to sharpen is saved Expenses versus mixed parsed Statement Entries.
- Existing statement reconciliation, feature persistence seams, Space ownership, attribution, and atomic import decisions continue to apply. The new ADR should identify any specific compatibility guidance it supersedes for this rename while preserving unrelated route lifecycle policy.
- Deliver implementation on a fresh task branch, preserve unrelated work, complete the required checks, commit and push the final revision, verify the remote commit, and open a PR last. Report any blocked completion gate. Merge only with authorization.
