# Spendeazy

Spendeazy is a personal-finance application for recording positive Expenses, reviewing statement Transactions, and planning spending with Category Budgets. Financial data is separate within Personal and Shared Spaces.

## People and Spaces

**User**:
The authenticated person using Spendeazy, with one sign-in identity, a private Personal Space, and membership in at most one active Shared Space.
_Avoid_: API User, internal user, account holder

**Space**:
The separate financial context to which Expenses, Categories, Budgets, Category Rules and Committed Statement Imports belong.
_Avoid_: Account, ledger, workspace

**Personal Space**:
A Space accessible only to its User, whose financial data remains separate from Shared Spaces.
_Avoid_: Individual account, private account

**Shared Space**:
A Space created when an invitation is accepted, in which two Users have equal authority to manage shared financial data.
_Avoid_: Shared account, family account, household account

**Archived Shared Space**:
A former Shared Space preserved as read-only history for its surviving members after either leaves or deletes their identity. It does not count toward a User's active Shared Space limit and cannot be reopened.
_Avoid_: Deleted Space, abandoned account

**Shared Space Invitation**:
A pending offer to form a Shared Space, reviewed and explicitly accepted by a signed-in User who has its Invite Code.
_Avoid_: Account invitation, membership link

**Invite Code**:
A shareable code identifying a Shared Space Invitation; possession allows review, not automatic membership.
_Avoid_: Email invitation link, invitation token

**Deleted User**:
A former User whose identity and Personal financial data have been removed, while their contribution to retained Shared history is attributed to Deleted user. Registering again does not restore their former access or attribution.
_Avoid_: Former payer, anonymous member

## Expenses and history

**Expense**:
Positive spending recorded manually or saved by confirming an included statement Transaction, with a date, description and Category. An Expense belongs to one Space and is distinct from the parsed Transaction that may have produced it.
_Avoid_: Spending record, Transaction, Statement Entry

**Transaction**:
Parsed statement activity, including purchases, outgoing transfers, payments, refunds, credits and cash-ins. Reviewing a Transaction does not create an Expense; only included eligible spending becomes an Expense on confirmation.
_Avoid_: Expense, Statement Entry, saved Transaction

**Added By**:
The User who originally recorded an Expense manually or confirmed it through Statement Import. Attribution is unchanged by later edits and does not identify who paid.
_Avoid_: Owner, payer

**Account**:
The source through which an Expense was made: Cash for manual Expenses, or the provider and account format of its Statement Import. Individual card or wallet identifiers do not define a separate Account.
_Avoid_: Space, payment owner

**Expense Activity**:
The retained record of an Expense's creation, changes and deletion, including who acted and when. Edits retain the values before and after the change; display names follow the current person and Category names.
_Avoid_: Budget history, bank activity

**Deleted Expense**:
An Expense removed from active lists and spending totals but retained with its Activity and original provenance for inspection. It cannot be restored at launch.
_Avoid_: Excluded Transaction, erased Expense

**Dashboard**:
The overview of a Space's actual Expenses, planning equivalents, Budget checks and successful Statement Imports for the selected Reporting Period.
_Avoid_: Spending Overview, Overview page

**Appearance**:
The light or dark presentation selected through Light, Dark or System, with System following the device's appearance.
_Avoid_: Theme, selectable style

## Categories and planning

**Category**:
A Space-owned spending classification assigned to Expenses and used across analysis, budgeting and statement review. A Category can exist without a Budget.
_Avoid_: Tag, label, Budget Category

**Category Color**:
A Category's visual identifier, used consistently including for historical Expenses and retained when renamed. Multiple Categories may share a Category Color.
_Avoid_: Expense color, chart color

**Inactive Category**:
A Category retired from new Expense assignments, rule matching, planning and Budget checks while retaining its historical Expenses, Budget and Rules. Existing Expenses may be corrected without changing it, and its settings may be maintained before reactivation.
_Avoid_: Deleted Category, archived Category

**Default Category**:
A Category copied from the maintained default catalog when a Space is created. Default describes its origin only; later catalog changes do not alter existing Spaces' Categories.
_Avoid_: System category, built-in category

**Budget**:
The single current recurring spending limit optionally assigned to a Category, with a positive amount and Monthly or Yearly recurrence. Current settings apply to retrospective comparisons; there are no historical Budget versions, effective dates or rollover.
_Avoid_: Allowance, savings pot, Budget Category

**Reporting Period**:
The inclusive date range selected for Expense reporting, such as a six-month window, a calendar year or year to date. Individual Budget checks use the relevant calendar month or full calendar-year limit rather than treating every Reporting Period as a monthly cap.
_Avoid_: Active month, Budget recurrence

**Monthly-equivalent Plan**:
The combined current Monthly Budgets and one twelfth of current Yearly Budgets among active Categories. It is a planning comparison, not a monthly limit for a Yearly Budget.
_Avoid_: Combined monthly cap, monthly Yearly Budget

**Planned**:
The Monthly-equivalent Plan multiplied by the number of calendar months counted in a reporting view, including a started current month in full.
_Avoid_: Prorated cap, historical Budget

**Over Budget**:
A Category whose actual Expenses exceed its current Budget's applicable calendar-month or calendar-year limit. Spending exactly equal to the limit is not Over Budget.
_Avoid_: Above plan, projected breach

**Nearing Budget**:
A Category whose actual Expenses reach at least 80% of its applicable Budget limit and remain below 100%.
_Avoid_: Projected breach, Over Budget

**At Budget Limit**:
A Category whose actual Expenses equal its applicable Budget limit exactly.
_Avoid_: Over Budget, rounded-to-limit

**Unbudgeted Expenses**:
Expenses assigned to Categories without a current active Budget. They remain part of actual Expense totals without an invented spending limit.
_Avoid_: Uncategorized Expenses, untracked spending

## Statement Import

**Statement Import**:
The Select file, Update and Confirm workflow that reviews supported statement Transactions and saves included eligible spending as Expenses.
_Avoid_: Upload, transaction import

**Committed Statement Import**:
The immutable provenance of a successfully confirmed Statement Import, including original evidence, confirmation totals, importer and destination Space. Later Expense edits or deletion do not rewrite that record.
_Avoid_: Parsed statement, review draft

**Supported Statement**:
A financial statement in a recognized provider and account format whose extracted activity can be compared with its control totals. A reconciliation warning does not prevent confirmation.
_Avoid_: Verified bank record, guaranteed-correct PDF

**Statement Type**:
The kind of Supported Statement: Credit Card or E-Wallet, distinct from its provider and account format.
_Avoid_: Provider, Account Type

**Transaction History Period**:
The inclusive date range covered by an E-Wallet statement's activity.
_Avoid_: Statement Date

**Unmapped Transaction**:
A parsed Transaction awaiting a Category assignment, including one whose applicable Rules identify different Categories. Every included Transaction must have an active Category before confirmation.
_Avoid_: Saved Uncategorized Expense, unknown Category

**Excluded Transaction**:
A parsed Transaction kept visible in review but omitted from confirmation's Expense count and totals. Automatically excluded payments, refunds, credits and cash-ins cannot become Expenses through review controls.
_Avoid_: Deleted Expense, ignored row

**Bulk Category Assignment**:
A manual assignment of one Category to multiple selected Transactions within an import draft. It is distinct from remembering a Category Rule for future imports.
_Avoid_: Bulk Rule, automatic merchant mapping

**Category Rule**:
A Space-owned association between a description pattern and a Category, evaluated using Exact or Contains matching during Statement Import. Matching ignores case, normalizes whitespace and excludes inactive Categories.
_Avoid_: Category mapping, remembered mapping

**Exact Rule**:
A Category Rule matching the entire normalized Transaction description, taking precedence over Contains Rules.
_Avoid_: Full-text rule

**Contains Rule**:
A Category Rule matching a normalized substring, including within a word, with punctuation remaining significant.
_Avoid_: Keyword rule, fuzzy rule

**Ambiguous Category Match**:
A match identifying multiple distinct Categories after Exact precedence is applied, leaving the Transaction Unmapped until manually assigned.
_Avoid_: Guessed Category, multiple matching rows

**Exact File Duplicate**:
A statement file whose content hash matches a Committed Statement Import in the destination Space. It is an overridable warning; an intentional reimport is distinct from retrying one confirmation.
_Avoid_: Forbidden statement, idempotent retry

**Probable Duplicate**:
A reviewed Transaction whose fingerprint matches another reviewed row or an imported Expense in the destination Space. It is an overridable review signal, not proof that the spending is identical.
_Avoid_: Proven duplicate, automatically removed Expense
