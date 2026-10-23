# Spendeazy

Spendeazy is a private personal-finance application for understanding spending, importing account statements, and assigning expenses to Categories with Budgets. It models expenses in one currency within Personal and Shared Spaces.

## Language

**User**:
The authenticated person using Spendeazy, with one sign-in identity, a private Personal Space, and membership in at most one active Shared Space.
_Avoid_: API User, internal user, account holder

**Space**:
The separate financial context to which Categories, Budgets, Expenses, Category Rules, and Committed Statement Imports belong.
_Avoid_: Account, ledger, workspace

**Personal Space**:
A Space accessible only to its User, whose financial data remains separate from Shared Spaces.
_Avoid_: Individual account, private account

**Shared Space**:
A Space created when an invitation is accepted, in which two Users have equal authority to manage shared financial data.
_Avoid_: Shared account, family account, household account

**Archived Shared Space**:
A former Shared Space preserved as read-only history for both members after either leaves; it does not count toward either User's active Shared Space limit.
_Avoid_: Deleted Space, abandoned account

**Shared Space Invitation**:
A pending offer from one User to form a Shared Space with another eligible User. A User must enter its Invite Code and explicitly accept to form the Shared Space.
_Avoid_: Account invitation, membership link

**Invite Code**:
A shareable code that identifies a Shared Space Invitation. A signed-in User who has the code can review the invitation and choose whether to join.
_Avoid_: Email invitation link, invitation token

**Added By**:
The User who originally recorded an Expense manually or confirmed it through Statement Import; this attribution remains unchanged by later edits and does not identify who paid.
_Avoid_: Owner, payer

**Dashboard**:
The authenticated overview of recent spending, monthly totals, budget usage, and recent Expenses.
_Avoid_: Spending Overview, Overview page

**Theme**:
A User's chosen visual style for Spendeazy, initially Technical or Playful. A Theme changes presentation while preserving financial data, page structure, and responsive layout.
_Avoid_: Skin, layout preset

**Appearance**:
Spendeazy's light or dark presentation, chosen independently of Theme through Light, Dark, or System. System follows the User's operating-system appearance.
_Avoid_: Theme, color theme

**Statement Import**:
The workflow that converts a supported account statement into categorized Statement Entries, from which included spending is saved as Expenses.
_Avoid_: File import, transaction import

**Committed Statement Import**:
The persisted provenance record for a Statement Import whose reviewed included Expenses have been confirmed and saved together. Temporary parsing and review state is not a Committed Statement Import.
_Avoid_: Parsed statement, upload

**Supported Statement**:
A financial account statement whose provider and account format Spendeazy recognizes and whose extracted activity can be reconciled against the statement's control totals.
_Avoid_: Compatible PDF, accepted statement

**Statement Type**:
The kind of Supported Statement being imported: Credit Card or E-Wallet. It is distinct from the statement's provider and the Account through which an Expense was made.
_Avoid_: Provider, Account Type

**Transaction History Period**:
The inclusive date range covered by an E-Wallet statement's transaction history.
_Avoid_: Statement Date

**Upload**:
The Statement Import stage in which a statement file is selected and processed.
_Avoid_: Import, ingest

**Categorize**:
The Statement Import stage in which Statement Entries are assigned to Categories and corrected when necessary.
_Avoid_: Map, update

**Review**:
The Statement Import stage in which categorized Statement Entries and statement totals are checked before confirmation.
_Avoid_: Confirm stage, validation

**Statement Entry**:
A parsed row from a Supported Statement. It may be spending, a payment, or a credit, and it is not an Expense until included spending is confirmed through Statement Import.
_Avoid_: Transaction, parsed expense, statement row

**Unmapped Statement Entry**:
A Statement Entry whose Category could not be determined during Statement Import. It has no match confidence; a user-assigned Category is Manual.
_Avoid_: Unmapped Expense, Unmapped Category, unknown transaction

**Excluded Statement Entry**:
A Statement Entry that remains visible during Statement Import but will not be confirmed or included in import summaries.
_Avoid_: Deleted expense, ignored row

**Expense**:
A positive amount of spending on an Account, recorded manually or confirmed through Statement Import. It may be assigned a Category.
_Avoid_: Transaction, record, statement row

**Account**:
The source through which an Expense was made. An imported Expense's Account is identified by its Statement Import's provider and account type; card or wallet identifiers do not define its Account identity. A manual Expense's Account is Cash.
_Avoid_: Payment Source

**Category**:
A spending classification assigned to an Expense and used consistently across analysis and budgeting.
_Avoid_: Tag, label

**Category Color**:
A Category's visual identifier, used consistently wherever that Category appears, including historical Expenses, and retained when it is renamed. Multiple Categories may share a Category Color.
_Avoid_: Expense color, chart color

**Inactive Category**:
A Category retired from future Expense assignments and Statement Import categorization while retaining its historical Expenses and spending. It can be reactivated for future use.
_Avoid_: Deleted Category, archived Category

**Category Match Confidence**:
The strength of an automatically assigned Category match, expressed from 0 to 1. Unmapped Statement Entries and manually assigned Expenses have no confidence.
_Avoid_: Match percentage, categorization score

**Category Suggestion**:
One of up to three proposed Categories shown for an Unmapped Statement Entry during Statement Import. It does not assign a Category; a User's selection becomes a Manual assignment.
_Avoid_: Automatic Category, AI assignment

**Bulk Category Assignment**:
A Manual assignment of one Category to multiple selected Statement Entries within the same Statement Import. It is distinct from a Category Rule that applies to future Statement Imports.
_Avoid_: Bulk Rule, automatic merchant mapping

**Category Rule**:
A persistent association between a description pattern and a Category, using either Exact or Contains matching during future Statement Imports. Matching ignores case and normalizes whitespace; rules for Inactive Categories do not participate.
_Avoid_: Category mapping, remembered mapping

**Exact Rule**:
A Category Rule whose pattern matches the entire normalized Statement Entry description. Exact Rules take precedence over Contains Rules.
_Avoid_: Full-text rule

**Contains Rule**:
A Category Rule whose pattern occurs anywhere within the normalized Statement Entry description, including within a word. Punctuation remains significant.
_Avoid_: Keyword rule, fuzzy rule

**Ambiguous Category Match**:
A match in which the applicable Category Rules identify more than one distinct Category after Exact Rule precedence is applied. The Statement Entry remains Unmapped until the User assigns a Category.
_Avoid_: Multiple matches, guessed Category

**Budget**:
The single recurring spending limit associated with a Category, over either a monthly or yearly period.
_Avoid_: Allowance, Budget Category

**Over Budget**:
A Category whose spending for the selected Reporting Period exceeds its monthly Budget. Spending exactly equal to the limit is not Over Budget.
_Avoid_: At limit, projected breach

**Nearing Budget**:
A Category whose spending for the selected Reporting Period is at least 80% of its monthly Budget and below the limit.
_Avoid_: Projected breach, Over Budget

**At Budget Limit**:
A Category whose spending for the selected Reporting Period equals its monthly Budget exactly.
_Avoid_: Over Budget, rounded-to-limit

**Budgeted Spending**:
Spending in Categories with a monthly Budget for the selected Reporting Period. It is the spending compared with the sum of those monthly Budgets.
_Avoid_: Total Spending, Covered Spending

**Unbudgeted Spending**:
Spending in Categories without a monthly Budget, including Uncategorized Expenses, for the selected Reporting Period.
_Avoid_: Remaining Spending, Untracked Spending

**Reporting Period**:
The calendar month and year used to scope Dashboard, Expense, and Category figures.
_Avoid_: Active Period, Date Filter

**Default Category**:
A Category copied from the maintained default catalog when a Personal or Shared Space is created. Default describes its origin only; subsequent catalog changes do not alter existing Spaces' Categories.
_Avoid_: System category, built-in category

**Uncategorized**:
The state of an Expense with no Category assignment. During Statement Import, an Unmapped Statement Entry is a parsed Statement Entry awaiting that assignment.
_Avoid_: Unassigned, categoryless

**Exact File Duplicate**:
A statement file whose content hash matches a Committed Statement Import already in the destination Space.
_Avoid_: Duplicate statement

**Probable Duplicate**:
An included Statement Entry whose fingerprint matches another reviewed row or a previously imported Expense in the destination Space. It is a review signal, not proof that the Expenses are identical.
_Avoid_: Duplicate expense, duplicate transaction
