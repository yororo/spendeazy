# Expense Tracking

This context describes the language of the personal expense tracker. It currently models expenses in one currency for multiple independent users.

## Language

**User**:
The authenticated person who owns categories, transactions, category rules, and statement imports. Each user has exactly one identity with the configured authentication provider.
_Avoid_: Account, customer

**Category**:
A classification for expenses with a name and optional description. A Category may be renamed, have its description edited, or be active or inactive while retaining its historical relationships.
_Avoid_: Tag

**Default Category**:
A Category copied from the maintained default catalog when a new User is provisioned. It behaves exactly like any other Category; "default" describes only its origin. Defaults are a creation-time starting point: later catalog changes do not alter existing Users' Categories.
_Avoid_: System category, built-in category

**Budget**:
The single recurring monthly or yearly spending limit associated with a category.
_Avoid_: Allowance, budget period

**Transaction**:
A positive expense recorded manually or committed from a reviewed statement import.
_Avoid_: Payment, ledger entry

**Uncategorized**:
The state of a transaction that has no category assignment.
_Avoid_: Unassigned, categoryless

**Statement import**:
The provenance record for one successfully reviewed and atomically committed credit-card statement. Temporary PDF parsing and review state is not a statement import.
_Avoid_: Upload, parsed statement

**Exact file duplicate**:
A statement file whose client-asserted content hash matches a statement import already owned by the same user.
_Avoid_: Duplicate statement

**Probable duplicate**:
An imported transaction whose fingerprint matches another reviewed row or a previously imported transaction for the same user. A probable duplicate is a review signal, not transaction identity.
_Avoid_: Duplicate transaction

**Category rule**:
A User-owned description pattern and match type, Exact or Contains, associated with a Category for categorizing transactions during statement review.
_Avoid_: Filter, categorization filter
