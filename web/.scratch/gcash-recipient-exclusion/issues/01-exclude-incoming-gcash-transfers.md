# Exclude incoming GCash transfers using an optional mobile number

## Parent

https://github.com/yororo/spendeazy-web/issues/43

## What to build

Deliver the complete optional GCash recipient-identification flow from Upload through confirmation. After successful extraction and reconciliation, and after any password Dialog has completed, ask for the User's GCash mobile number. Use it only in the browser to classify transfers to that recipient as Debit and permanently exclude them while keeping them visible. Users who skip retain existing classification and can manually exclude incoming transfers.

Use the agreed Dialog copy in the parent specification, explaining the purpose, privacy handling, and manual work required when skipping. Reuse existing Statement Import and design-system conventions. No API or database schema changes are needed.

## Acceptance criteria

- [ ] Prompt only for parser-recognized GCash statements before Categorize, regardless of filename. Other providers retain their existing workflow.
- [ ] Password-protected statements finish unlocking before the number Dialog appears. Incorrect-password retries, password cancellation, unsupported statements, and extraction/reconciliation failures retain existing behavior; Dialogs never overlap.
- [ ] Display the parent specification's title, explanation, privacy message, optional field label, format hint, Continue, and Skip actions.
- [ ] Accept exactly 11 digits beginning with 09 after trimming surrounding whitespace. Reject +63, other prefixes, incorrect lengths, letters, and internal separators with an inline explanation. Invalid nonblank input blocks Continue but not Skip or dismissal.
- [ ] Blank Continue, Skip, close, and Escape continue without applying recipient reclassification.
- [ ] Match the complete Transfer from <sender> to <recipient> description pattern with an exact recipient match, ignoring case and normalizing whitespace. Preserve and accommodate parser-added reference annotations.
- [ ] Given 09999999999, both Transfer from 09111111111 to 09999999999 and Transfer from 09222222222 to 09999999999 become Debit and excluded.
- [ ] Transfers from the supplied number to other recipients, different recipients, number substrings, and incidental mentions remain unaffected. Preserve existing unrelated classification.
- [ ] Matching rows use the existing incoming-Transaction sign convention, stay visible, and cannot be re-included. Preserve magnitudes, dates, descriptions, and references.
- [ ] Matching rows are omitted from included summaries, Review totals, and confirmation payloads. Existing manual exclusion remains usable when the prompt is skipped.
- [ ] Reconciliation still checks all extracted rows against original provider control totals and fails closed. Exclusion does not remove rows before reconciliation.
- [ ] Keep entered input transient to the current import; never add it to API requests, database records, browser storage, URLs, logs, or telemetry. Discard it when no longer needed or when the import is abandoned/replaced. Another GCash import asks again without prefilling.
- [ ] Correcting or adding the number after Categorize requires restarting Statement Import. No edit-number action or description-redaction feature is added.
- [ ] Dialog is accessible with keyboard navigation, focus management, labelled input, inline errors, and a readable responsive layout using existing design tokens.
- [ ] Extend existing workflow tests for provider/password sequencing, validation/dismissal, matching/nonmatching examples, immutable Debit exclusion, Review/confirmation, restart, reconciliation, and privacy. Test observable behavior using existing extraction and transport seams; distinguish entered input from numbers already present in descriptions.
- [ ] Run repository lint, build, and tests, and record relevant browser/API validation of the financial import flow.

## Blocked by

None — can start immediately. The parent is the agreed specification, not an implementation blocker.

## Scope notes

Entered-value privacy does not redact mobile numbers already in statement descriptions. Do not expand to other providers, arbitrary description patterns, persistent identifiers, international number conversion, or changing existing manual exclusion rules.
