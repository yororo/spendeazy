# GCash recipient exclusion specification

Status: shared understanding confirmed; specification only. Implementation is not part of this task.

## Problem Statement

GCash descriptions such as `Transfer from <sender> to <recipient>` are currently treated as outgoing spending because Statement Import does not know the User's wallet number. Users must locate and exclude incoming transfers manually to avoid counting them as expenses.

## Solution

Offer an optional GCash mobile-number prompt before Categorize. Use the entered value only in the browser to identify incoming transfers, mark them Debit, and exclude them from the current Statement Import. Explain the purpose, privacy handling, and manual work required when skipping.

## Implementation Decisions

- Show an optional mobile-number Dialog only for a detected GCash statement, after successful password entry when required and before Categorize.
- Accept exactly 11 digits beginning with `09`. Trim surrounding whitespace; reject `+63` and other invalid formats with an inline explanation.
- Skip, closing the Dialog, and Escape continue without applying the recipient rule.
- Match the complete `Transfer from <sender> to <provided number>` description, ignoring case and extra whitespace. Match the recipient, not incidental occurrences of the number. Preserve existing parser reference annotations.
- Matching Transactions are marked Debit and excluded, remain visible during Statement Import, and are omitted from confirmation and import summaries.
- Transfers from the provided number to other recipients remain unaffected by this rule.
- Use the entered number only for the current Statement Import. Do not persist it or send it to the API, database, or telemetry. This minimizes sensitive-data exposure. Ask again for each GCash statement.
- Matching rows inherit permanent Debit exclusion: they remain visible but cannot be re-included.
- Correcting or adding the number after Categorize requires restarting Statement Import.
- Privacy scope covers the entered value. Redacting numbers already present in statement descriptions is a separate change.
- Explain why the number is requested, its use in excluding incoming transfers, and the manual work required if skipped.
- Keep this behavior within Statement Import, using its existing parsing, categorization, exclusion, and generic Dialog interfaces. No API or database schema change is required.
- Gate the prompt on the parser's recognized provider identity, not the filename. Complete extraction and reconciliation successfully before advancing through the new prompt. Preserve password retries, password cancellation, and processing errors.
- Reject letters, internal separators, incorrect lengths, and non-09 prefixes. Do not automatically convert international numbers. Invalid nonblank input blocks Continue but never prevents Skip or dismissal.
- Apply the existing incoming-Transaction sign convention while preserving amount magnitudes, dates, descriptions, and references. Do not remove rows before reconciliation or replace provider control totals with included-spending totals.
- Discard the entered number when classification no longer needs it or the import is abandoned or replaced. Do not place it in browser storage, URLs, persisted statement data, logs, or telemetry. Never prefill the next import.
- Use established accessible Dialog behavior, labelled input, inline validation, keyboard operation, focus management, responsive layout, and semantic design tokens.

### Modal copy

Title: **Identify incoming GCash transfers**

Enter your GCash mobile number to automatically mark transfers to you as Debit and exclude them from this import. If you skip, search for your number in the transactions and manually exclude transfers to you.

The number you enter is used only in your browser for this import; it is not saved or sent to our servers.

Field label: **GCash mobile number (optional)**

Field hint: **11 digits starting with 09, e.g. 09999999999.**

Actions: **Continue**, **Skip**. Continuing with a blank field also skips the rule.

## User Stories

1. As a User importing GCash, I want an optional number prompt, so that incoming transfers can be identified automatically.
2. As a User with a protected statement, I want to unlock it first, so that prompts follow a clear sequence.
3. As a User with an unprotected GCash statement, I want the prompt before Categorize, so that classification is ready for inspection.
4. As a User importing another provider, I want the existing workflow preserved, so that I am not asked an irrelevant question.
5. As a User, I want to know why my number is requested, so that I can make an informed choice.
6. As a User, I want to understand what happens when I skip, so that I can manually find and exclude transfers to me.
7. As a User, I want local 09-format input and clear validation, so that I can correct invalid numbers.
8. As a User, I want surrounding whitespace ignored, so that pasting a valid number works.
9. As a User, I want Skip and dismissal to continue the import, so that providing my number remains optional.
10. As a User, I want transfers to my exact number matched regardless of sender, so that all matching incoming transfers are excluded.
11. As a User, I want outgoing transfers and incidental mentions of my number unaffected, so that unrelated spending remains accurate.
12. As a User, I want matching rows visibly marked Debit, so that I understand their exclusion.
13. As a User, I want Debit rows to remain visible but unavailable for inclusion, so that existing exclusion behavior stays consistent.
14. As a User, I want excluded rows omitted from confirmation and summaries, so that incoming transfers do not inflate spending.
15. As a User, I want the entered value never stored, transmitted, or logged, so that sensitive-data exposure is minimized.
16. As a User, I want each GCash import to ask again, so that my number is not retained between imports.
17. As a User who skipped or entered the wrong number, I want to restart the import to supply it again, so that I can correct classification.
18. As a User, I want keyboard support and a readable narrow-screen prompt, so that this step is accessible.
19. As a User, I want reconciliation preserved, so that exclusions cannot hide incomplete extraction.

## Testing Decisions

Test observable behavior rather than internal state or matching-helper implementation. Prefer the existing Statement Import workflow as the primary integration seam, mocking PDF extraction and network transport where necessary while exercising real provider recognition, classification, and exclusion.

Existing Vitest and Testing Library password-challenge tests provide prior art for Dialog sequencing and extracted-text fixtures. Existing Statement Import page tests provide workflow and API assertion patterns; categorizer fixtures provide classification and reconciliation regression cases. Extend these established seams rather than introducing a new public test interface. This test approach is a recommendation for future implementation.

Acceptance coverage:

| Scenario | Expected result |
| --- | --- |
| Unprotected GCash statement | Number prompt before Categorize. |
| Protected GCash statement | Password succeeds first; Dialogs do not overlap. |
| Wrong password or cancelled password challenge | Existing retry/cancel behavior; no premature number prompt. |
| Other provider, unsupported statement, or failed reconciliation | No GCash prompt; existing success/error behavior. |
| `09999999999`, including surrounding whitespace | Accepted after trimming. |
| Wrong length, non-09 prefix, letters, internal separators, or +63 | Inline error; Continue does not advance. |
| Blank Continue, Skip, close, or Escape | Continue without recipient reclassification. |
| Number `09999999999`; `Transfer from 09111111111 to 09999999999` | Debit, visible, permanently excluded. |
| Same number; `Transfer from 09222222222 to 09999999999` | Debit, visible, permanently excluded. |
| Case/whitespace variants and parser reference suffix | Same match; reference information preserved. |
| Transfer from supplied number to another recipient | Unaffected by this rule. |
| Different recipient, number substring, or unrelated mention | Unaffected by this rule. |
| Matching row in Categorize | Existing Debit presentation; cannot be re-included. |
| Review and confirmation | Matching rows omitted from included totals and submitted Transactions. |
| Skip, then manually exclude a transfer | Existing manual exclusion remains available. |
| Restart or another GCash import | Fresh prompt without retained input. |
| Persistence and network inspection | Entered value not added to requests, storage, logs, or telemetry; distinguish it from numbers already in descriptions. |
| Reclassification | Amount magnitudes and provider reconciliation preserved. |
| Keyboard and narrow-screen use | Readable, operable prompt with correct focus behavior. |

When implemented, run repository lint, build, and tests plus relevant browser/API validation of the financial import flow. This specification-only task does not execute or claim those future checks.

## Out of Scope

- Implementation during this specification task.
- Saving or remembering the entered number, or adding API/database fields for it.
- Redacting numbers already present in statement descriptions.
- Supporting +63 input or automatic international-format conversion.
- Extending detection to other providers or arbitrary description patterns.
- Editing the number after Categorize without restarting.
- Allowing Debit Transactions to be re-included.
- Changing reconciliation rules or existing manual exclusion semantics.

## Further Notes

The User confirmed shared understanding. This specification supersedes the earlier interview notes and is also published to GitHub as the parent specification for the implementation ticket. Implementation is a separate task.

- Parsing runs in the browser. GCash is identified by the parser, not the filename.
- Incoming Transactions have positive amounts in Categorize, display Debit, and cannot currently be included again.
- Statement descriptions already contain mobile numbers and are retained for included Transactions. The privacy guarantee for the newly entered value does not by itself redact those descriptions.
- Reconciliation includes all extracted rows before exclusion; recipient classification must preserve this check.
