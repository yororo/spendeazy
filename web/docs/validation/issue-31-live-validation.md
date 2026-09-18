# Issue #31 live validation

Validation date: 2026-09-10 (Asia/Manila)

## Automated page validation

The `CategorizeStatement` page seam covers mobile remembered-Rule control
ordering, default Contains selection, Exact selection, description
synchronization, manual-pattern independence, normalized persistence,
recategorization of included Transactions, exclusion preservation, and
failure-state retention. The `StatementImportPage` seam also verifies the
normalized mobile Category Rule request through the authenticated API client.

## Authenticated browser validation

The connected authenticated local Imports route was checked at a 430px
viewport. The mobile editor revealed the remembered-matching controls with
Match type before Pattern, showed Contains by default, and allowed Exact to be
selected with keyboard navigation. The rendered dialog and controls remained
within the viewport: document/body scroll width was 430px, dialog width was
398px, and both remembered-Rule controls were 356px wide with a right edge at
393px.

Keyboard validation activated Remember matching with Space, selected Exact
with ArrowDown and Enter, cleared Pattern with Control/Command+A and
Backspace, and activated Save with Enter. The empty-pattern validation error
remained visible with the selected controls intact; Cancel was then activated
with Enter.

The editor was canceled after validation. No authenticated live mutation was
saved.
