# Classify Statement Imports by Statement Type

## Problem Statement

During Statement Import, an E-Wallet transaction history is presented with Credit Card statement labels. A GCash document has a Transaction History Period and Total Debit, but Categorize and Review show a Statement Date and Statement Amount. Review also shows an account-number placeholder absent from the document. GCash descriptions include a reference-number suffix that makes spending harder to scan and affects Category Rule matching. Users need the import to present the controls and transactions actually supplied by their document, while preserving a useful probable-duplicate signal without storing raw reference numbers.

## Solution

Automatically classify each Supported Statement as Credit Card or E-Wallet and preserve its Statement Type on the Committed Statement Import. Credit Card imports retain their current fields. An E-Wallet import shows its inclusive Transaction History Period and the document's original Total Debit during Categorize and Review and, after confirmation, on the success screen and in import history. Remove the fictitious account-number placeholder. Keep each transaction's Amount and Debit/Credit indication. New GCash descriptions omit the reference suffix. The API stores a one-way, secret-keyed hash of each imported GCash reference and uses it to identify probable duplicates within the destination Space.

## User Stories

1. As a User, I want an uploaded Supported Statement classified automatically, so that I see the right information without selecting a format manually.
2. As a User, I want Credit Card statements identified as Credit Card, so that their existing statement details remain understandable.
3. As a User, I want GCash transaction histories identified as E-Wallet, so that they are not presented as Credit Card statements.
4. As a User, I want Statement Type distinct from provider and Account, so that GCash remains the provider and E-Wallet remains the document kind regardless of how its Account is displayed.
5. As a User, I want the Transaction History Period shown during Categorize, so that I know which dates the wallet document covers.
6. As a User, I want the same period shown during Review, so that I can check it before confirmation.
7. As a User, I want both period endpoints shown as an inclusive range, so that I do not mistake its end for a statement issue date.
8. As a User, I want Total Debit shown during Categorize, so that I can compare the parsed activity with the document's control total.
9. As a User, I want Total Debit shown during Review, so that I can make the same comparison before confirmation.
10. As a User, I want Total Debit to remain the document's original value when I exclude transactions, so that it is not confused with the amount selected for import.
11. As a User, I want any included-transaction total labelled separately, so that I can distinguish reviewed expenses from the document's Total Debit.
12. As a User on a narrow screen, I want the E-Wallet period and Total Debit labelled clearly, so that mobile summaries do not revert to ambiguous Date and Amount labels.
13. As a User, I want an E-Wallet review to omit an account-number placeholder that the document did not supply, so that I do not infer a wallet identifier was verified.
14. As a User, I want transaction rows to retain their Amount column and Debit/Credit indicators, so that I can understand both outgoing and incoming activity.
15. As a User, I want new GCash transaction descriptions to omit the reference suffix, so that descriptions are readable and Category Rules match the meaningful wording.
16. As a User, I want GCash recipient identification and exclusion to keep working after the suffix is removed, so that incoming transfers to me are not imported as expenses.
17. As a User, I want the import success screen to identify the saved Statement Type and show an E-Wallet period and Total Debit, so that the confirmation reflects what I reviewed.
18. As a User, I want import history to distinguish Credit Card and E-Wallet records and show the E-Wallet period and Total Debit, so that I can understand older import entries.
19. As a User, I want an E-Wallet import's period end used for existing date ordering and filtering, so that history behavior stays predictable.
20. As a User, I want GCash reference numbers kept out of saved descriptions and responses, so that the reference does not appear as transaction text.
21. As a User, I want the database to retain only a one-way value for a GCash reference, so that the raw number is not recoverable from a database read.
22. As a User, I want two GCash payments with the same description, date, and amount but different references to remain distinguishable in duplicate review, so that legitimate repeated payments are not grouped solely by their visible wording.
23. As a User, I want rows with the same GCash provider and reference flagged as probable duplicates even if their other details differ, so that changes in wording or amount do not hide a repeated source row.
24. As a User, I want probable-duplicate review scoped to the destination Space, so that activity in another Space does not influence my import.
25. As a User, I want probable duplicates to remain review signals that I can acknowledge, so that a repeated reference does not silently discard a transaction.
26. As a User, I want an unsupported or unreconciled document rejected as before, so that Statement Type classification does not weaken import validation.

## Implementation Decisions

- The browser's provider-specific statement transformer assigns an explicit Credit Card or E-Wallet Statement Type during parsing. Classification is automatic. Provider recognition and reconciliation continue to gate Supported Statements; an unsupported or ambiguous document is not assigned a type by guesswork.
- The parsed summary carries Statement Type. For E-Wallet statements it also carries the inclusive Transaction History Period and original Total Debit. The GCash transformer already extracts and reconciles these controls; expose them as their own concepts rather than aliasing the period end as a statement date and Total Debit as an amount due.
- Credit Card summary fields and presentation retain their current behavior. E-Wallet summary fields and headings apply in both mobile and desktop Categorize and Review views. Remove the wallet account-number placeholder. Transaction row Amount headings and Debit/Credit badges remain.
- The commit contract and Committed Statement Import persist Statement Type and, for E-Wallet, period start and Total Debit. The existing statement-date field represents the period end for E-Wallet imports, preserving history order, filters, and cursors; user-facing E-Wallet views present it as the end of the Transaction History Period. Validate a complete, ordered period and a valid nonnegative monetary control total for E-Wallet commits. Do not require Total Debit to equal the sum of included Transactions because exclusions and incoming rows can change that sum.
- API responses for committed imports and history expose the saved type and E-Wallet controls. The web API adapter maps them into the success and history read models. The API's generated OpenAPI contract remains canonical; no web-side copy is introduced.
- Existing QA imports, if present, derive or backfill Statement Type from saved provider/account-type metadata, recognizing GCash as E-Wallet. There are no users; no migration of historical GCash descriptions or raw references is required. New imports follow the new reference rules.
- The GCash transformer parses each row's reference separately and omits its suffix from the Transaction description. The reference follows the reviewed row through categorization and exclusion; only included rows are committed. Description edits do not change the parsed reference. Recipient identification works on the clean description.
- The authenticated commit request may carry a raw GCash reference solely to let the API derive its hash. The API does not save or return raw references, include them in operational logs, or append them to descriptions. Persist a deterministic HMAC-SHA-256 of a domain-separated tuple containing destination Space, provider, and reference, using a dedicated secret configured for every database-backed environment. Keep the key stable across deployments so old and new hashes remain comparable. A plain unkeyed SHA-256 of the short numeric reference is insufficient.
- Reference-based probable-duplicate detection is scoped to the destination Space. For GCash rows with references, equal provider/reference hashes form a probable-duplicate group even if date, description, or amount differ; distinct references do not become probable duplicates merely because those other fields match. Other supported statements continue using the existing versioned content fingerprint. Preserve existing acknowledgement and atomic commit behavior.
- Add explicit database migrations for new Committed Statement Import metadata and a nullable per-Transaction reference hash. Define constraints and indexes consistent with Space-scoped lookup and the one-way hash format. Keep persistence inside the existing feature-owned statement-import and transaction stores and their shared unit of work.

## Testing Decisions

- Tests assert observable parsing, labels, saved values, API responses, and duplicate outcomes rather than component structure, CSS classes, private hash implementation steps, or exact HMAC bytes.
- The principal browser seam is the existing Statement Import page test with the checked-in GCash extracted-text fixture. Exercise upload through Categorize, Review, and success, including mobile and desktop summaries, exclusions, clean descriptions, recipient handling, and the retained Amount and Debit/Credit row presentation. Follow existing Statement Import page and parser tests.
- The principal server seam is the existing Statement Import API test. Verify the commit and read contracts, saved Statement Type and controls, refusal of invalid E-Wallet periods or totals, Space-scoped reference duplicate signals and acknowledgement, and absence of raw references in persisted and returned values. Use the existing PostgreSQL-backed import tests where storage, migration, and atomicity matter.
- A focused hashing test may establish determinism, key separation, and non-equivalence to a plain SHA-256 reference hash. It should test the security contract without hard-coding the secret or internal HMAC bytes.
- Run both projects' required lint, build, and tests, API contract generation/checking, and the repository's isolated browser/API/PostgreSQL end-to-end suite before considering implementation complete.

## Out of Scope

- A manual Statement Type selector or support for additional wallet providers and formats.
- Changing Credit Card parsing, statement controls, or transaction presentation.
- Rewriting descriptions or references on historical QA imports.
- Storing or showing GCash reference numbers in transaction descriptions, committed responses, or import history.
- Changing the meaning of Account or adding a wallet-identifier/account-number field.
- Changing exact-file duplicate detection or converting probable duplicate signals into automatic rejection or deletion.

## Further Notes

- The checked-in GCash example covers August 9 through September 7, 2026 and reports Total Debit 26,696.92 and Total Credit 10,081.00. Its starting and ending balances and both control totals currently support reconciliation; this spec changes their presentation and persistence, not the requirement to reconcile.
- The source document has no Credit Card-style statement date, account number, or amount due. Its period end remains the API's sortable date solely for compatibility with existing history behavior.
- The current server fingerprint uses date, description, amount, provider, and account type. Removing the reference suffix requires a separate reference-based signal for GCash so repeated same-looking payments can be distinguished without retaining the raw reference.
