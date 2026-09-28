# Suggest Categories for Unmapped Statement Transactions

## Problem Statement

During Statement Import, a Transaction without a matching Category Rule remains Unmapped. The User must search the active Category list for every such Transaction, even when the description resembles previously categorized spending in the same Space. This slows review, especially on narrow screens and for statements with many unfamiliar descriptions. A plausible suggestion must never be mistaken for a saved assignment or override a Category Rule.

## Solution

During Categorize, prepare up to three Category Suggestions for each included Unmapped Transaction. Show them below the Category selector only while that Transaction is being edited, with a quiet entry point on its Unmapped row. The User may choose one suggestion or any other active Category; the choice fills the existing field and becomes a Manual assignment only when the edit is saved. Suggestions do not block Categorize or Review. If the service is slow, unavailable, or has no adequately supported match, the existing Category selector remains the complete path forward.

Suggestions use Jev's typed Category choice with an explicit none-of-the-above option. The service considers the Transaction description, the active Category names and optional descriptions, and a bounded set of relevant categorized Transactions from the destination Space. The API controls candidate selection, authorization, minimization, thresholds, and result validation; the browser does not hold TypeSafe credentials.

## User Stories

1. As a User importing a Supported Statement, I want Category Suggestions for an Unmapped Transaction, so that I can categorize it faster.
2. As a User, I want at most three suggestions for one Transaction, so that I can scan them quickly.
3. As a User, I want one Category per Transaction, so that suggestions do not change how expenses and Budgets work.
4. As a User, I want Category Rules to continue assigning Categories first, so that my explicit preferences remain authoritative.
5. As a User, I want an Ambiguous Category Match to remain visibly ambiguous, so that AI does not conceal conflicting Rules.
6. As a User, I want suggestions limited to active Categories in the destination Space, so that I cannot accidentally choose an unavailable or unrelated Category.
7. As a User, I want a quiet indication that suggestions are available on an Unmapped row, so that I can find them without cluttering the statement.
8. As a User editing an Unmapped Transaction, I want suggestions adjacent to the Category selector, so that I can compare them with the full list.
9. As a User on a narrow screen, I want the same suggestions in the mobile editor, so that I do not need a separate workflow.
10. As a keyboard or screen-reader User, I want each suggestion announced as an action with its Category name, so that I can select it without relying on color or position.
11. As a User, I want selecting a suggestion to fill the Category field without immediately saving, so that I can check and change it before committing the edit.
12. As a User, I want to choose a Category outside the suggestions, so that a missed candidate does not restrict my choice.
13. As a User, I want a saved suggested choice marked Manual, so that the app does not present it as a Category Rule assignment.
14. As a User, I want saving a suggested Category to create a Category Rule only if I explicitly choose to remember it, so that one selection does not silently change later imports.
15. As a User, I want no suggestion shown when the available evidence is weak, so that an arbitrary guess does not influence me.
16. As a User, I want Categorize available while suggestions load, so that network latency does not delay review.
17. As a User, I want to keep using the ordinary Category selector if the suggestion service fails, so that I can finish the Statement Import.
18. As a User, I want a description edit to invalidate suggestions for the old description, so that stale advice does not appear on a changed Transaction.
19. As a User, I want later edits to saved Transactions to inform future suggestions, so that the app follows the Space's current categorization choices.
20. As a User in a Shared Space, I want examples drawn only from that Shared Space, so that my Personal Space and other Spaces do not affect its suggestions.
21. As a User, I want deleted Transactions and Inactive Categories excluded from suggestion evidence, so that retired data does not drive a current choice.
22. As a User, I want duplicate descriptions within one import to reuse a suggestion result, so that repeated rows do not cause avoidable delays.
23. As a User, I want imported financial details minimized in the AI request, so that unnecessary statement data is not disclosed.
24. As a User, I want Review to use only my saved Category assignments, so that an unselected suggestion never enters a Committed Statement Import.

## Implementation Decisions

- Keep the browser's Exact and Contains Category Rule matching and precedence. Suggest only for included Transactions whose assignment is Unmapped; do not replace a Rule assignment or resolve an Ambiguous Category Match.
- Add an authenticated, Space-scoped suggestion capability in the API's Statement Import feature. Resolve membership through the existing Space access boundary before reading Categories or historical Transactions. A legacy Personal Space route may follow existing compatibility conventions if needed. The request carries only the reviewed Transaction description and destination Space identity; the server derives the rest of the evidence. The response contains zero to three ordered active Category IDs and display metadata sufficient for the browser to render them. It never assigns a Category or commits an import.
- Define a narrow application-owned read port for active Category names/descriptions and relevant saved Transaction descriptions with their current Category. Implement it with bounded, Space-scoped queries. Exclude deleted Transactions and examples assigned to Inactive Categories. Include manual and imported Transactions; use current Category assignments so later edits supersede earlier labels. Prefer useful, diverse examples over a large raw history dump, and cap per-Category and total examples. Do not use another Space's data, even when the same User belongs to both.
- Reuse the existing optional Category description field and Categories editor. No Category schema migration is needed. Include descriptions when present; a blank description is valid. The Statement Import adapter must obtain descriptions for suggestion context without broadening unrelated web read models.
- Keep TypeSafe credentials in API configuration. The Jev adapter submits a structured text state containing only the target description, active Category names/descriptions, and selected same-Space example descriptions and labels. Do not send the PDF, full statement text, amount, date, Account identifiers, references, names, or unrelated Transactions. Do not log raw request or response bodies. Treat description text as untrusted data, not instructions.
- Use a typed Choice over active Category IDs plus an explicit none-of-the-above option. Use the returned probability distribution to rank candidates; do not interpret the chosen answer or Choice confidence as proof of correctness. Validate that every returned ID is in the authorized active set, remove duplicates, and return no suggestions when the none option leads or the result fails thresholds. Establish probability, margin, and top-three display rules from a curated evaluation set before release. Do not hard-code cookbook example thresholds as product policy.
- Avoid returning a weak third choice solely to fill three slots. Return zero, one, two, or three suggestions. Keep the scores internal unless evaluation supports a clear user-facing interpretation; do not reuse the persisted Category Match Confidence field for unsaved suggestions.
- Prepare suggestions in the background once parsing and Rule categorization finish. Deduplicate equal normalized descriptions within the import, bound concurrent requests, and cache results only for the current import and destination Space. Neither loading nor errors block Categorize, Review, or import confirmation. Discard or refresh a result after description changes, destination Space changes, Category list changes, exclusion, or import reset; ignore late responses for stale inputs.
- In the desktop and mobile Categorize editor, render compact suggestion controls directly below the Category selector. The Unmapped row receives a subtle entry point only when suggestions are available. Selecting a control updates the draft Category; existing Save/Cancel and Remember Category Rule actions retain their semantics. Preserve keyboard focus, accessible names, touch targets, and the design system's Category colors.
- The API commit contract and transaction persistence remain unchanged. An accepted suggestion is a Manual assignment. No suggestion provenance, probability, acceptance event, or evaluation feedback is stored with a Transaction or Committed Statement Import.
- Update API DTO/controller metadata and the canonical generated OpenAPI YAML, then update the web endpoint adapter against that contract. Configuration must fail safely when TypeSafe is unavailable; the optional suggestion capability must not prevent ordinary Statement Import.

## Testing Decisions

- Test observable behavior: which suggestions a User sees, whether selecting one requires Save, what assignment is committed, Space isolation, Rule precedence, stale-result handling, and graceful failure. Avoid tests tied to prompt wording, component markup, private ranking helpers, or exact model probabilities.
- Use the existing isolated browser/API/PostgreSQL Statement Import flow as the principal acceptance seam, covering parsing through Categorize, Review, and commit with Jev stubbed at the API integration boundary. Verify that a selected suggestion becomes a Manual assignment only after Save and that ordinary import still works when suggestions fail. Extend the local synthetic test harness as needed rather than creating a separate test path.
- Extend existing Statement Import page and workflow tests for focused desktop and mobile behavior: one to three suggestions, no suggestion, selecting an alternative Category, description changes, and continued review while suggestions fail or load. Add API HTTP and PostgreSQL-backed tests for authentication, Space authorization, candidate eligibility, bounded same-Space examples, current assignments after edits, exclusion of deleted Transactions and Inactive Categories, contract shape, and missing TypeSafe configuration. Stub the TypeSafe response at the API adapter boundary. Existing Statement Import and Category tests provide the prior art.
- Maintain a separate redacted, manually labeled evaluation set of realistic Transaction descriptions and Category catalogs. Measure top-one and top-three accuracy, coverage when suggestions are suppressed, wrong-suggestion rate, latency, request volume, and cost across Spaces, providers, ambiguous merchant names, local-language descriptions, and sparse-history cases. Compare with the no-AI baseline and select thresholds from these results. This evaluation is not an in-product feedback store.
- Before implementing code changes, follow the owning projects' lint, build, test, OpenAPI generation/check, and the repository's isolated browser/API/PostgreSQL end-to-end requirements.

## Out of Scope

- Automatically assigning a Category based on Jev output, splitting one Transaction across Categories, or overriding Category Rules.
- Suggestions for Ambiguous Category Matches, excluded Transactions, manually categorized Transactions, or Transactions outside Statement Import.
- Persisting suggestions shown, choices accepted or rejected, model scores, or other product feedback records.
- Creating Category Rules from selection alone, changing the Category Match Confidence meaning, or changing import commit and duplicate detection rules.
- Sending complete statements or the User's full transaction history to TypeSafe.

## Further Notes

- The existing Category description is already optional and editable, so the work is to use it as context, not to introduce a new column.
- TypeSafe Choice returns a distribution over supplied options; it cannot choose an omitted Category. Candidate coverage and the none option must therefore be checked in evaluation. Choice confidence measures distribution concentration rather than end-to-end recommendation accuracy.
- The API has an external service dependency only for optional suggestions. The core import path remains usable when that dependency is slow, unconfigured, or unavailable.
