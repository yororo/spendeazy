---
name: improve-ux
description: Review one or more Spendeazy mobile UI elements (screens, pages, or components) against the project's UX principles and design tokens. Propose justified improvements in a before/after table for approval, allowing no recommendations when none are warranted. Use for UX reviews, not routine UI implementation.
---

# Review Spendeazy UX

Review the requested user interface/s for concrete improvements to the user's experience. Do not implement improvements until the user approves the presented proposals.

## Scope and evidence

Be creative, innovative, and unique when coming up with design/UX improvements! At the same time, follow the `mobile-app/design/ux-principles.md` as the guiding design philosophy. 

If the checkout or required documents cannot be found, request their location rather than substitute generic design advice.

Identify the requested screens/components and the user task each supports. Inspect the current implementation, relevant shared components, theme values, and supplied screenshots or design evidence. If the guidance documents conflict, identify the conflict and ask the user before recommending the affected choice.

Do not invent observations from screenshots or code paths you have not inspected. Ask for missing scope only when it cannot reasonably be inferred.

If the ask is unclear or some critical details are missing, ask the user for confirmation rather than assuming.

## Judge improvements

Distinguish usability issues from personal aesthetic preferences. Do not manufacture findings, fill a quota, broaden the assignment. A documented pending native check alone is not a confirmed defect. Put material unanswered verification questions outside the recommendation table.

Rate impact by user benefit, not implementation effort:

- **High:** removes a task blocker, serious misunderstanding, inaccessible essential action, or substantial risk of an unintended action.
- **Med:** meaningfully improves a recurring interaction, discoverability, comprehension, or recovery while the task remains possible.
- **Low:** a smaller, evidenced improvement to scanning, clarity, or consistency with limited effect on task completion.

## Present for approval

Briefly identify the reviewed scope and evidence, then present only justified recommendations ordered by impact. Give proposals stable IDs for selective approval. Use this table:

| ID | Element | Before (current) | After (proposed change) | UX rationale and guidance | Impact |
| --- | --- | --- | --- | --- | --- |

Describe actual current behavior and a concrete replacement. Explain the benefit to the user's task and cite the relevant guidance section and implementation/design evidence with useful links. Use High, Med, or Low for impact. Note important tradeoffs or shared-component effects in the affected row. Consolidate duplicate findings across elements while naming the affected locations.

If no improvements are justified, say so plainly and identify the scope reviewed; omit the empty table and approval request. Distinguish that conclusion from insufficient evidence, and state material limits on the assessment. Do not suggest cosmetic churn as a fallback.

When proposals exist, ask which IDs the user approves, without starting implementation. Keep application code, design files, tokens, dependencies, and configuration unchanged during review. A request to review or suggest fixes, even if it mentions implementation, does not skip presenting proposals and obtaining approval first. If approval arrives later, implement only the approved scope under applicable repository guidance; new or materially changed proposals require approval before implementation.
