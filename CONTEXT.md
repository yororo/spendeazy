# Spendeazy

Spendeazy is a private personal-finance application for understanding spending, importing account statements, and assigning expenses to Categories with Budgets. It models expenses in one currency within Personal and Shared Spaces.

## Language

**User**:
The authenticated person using Spendeazy, with one sign-in identity, a private Personal Space, and membership in at most one active Shared Space.
_Avoid_: API User, internal user, account holder

**Space**:
The separate financial context to which Categories, Budgets, Transactions, Category Rules, and Committed Statement Imports belong.
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
The User who originally recorded a Transaction manually or confirmed it through Statement Import; this attribution remains unchanged by later edits and does not identify who paid.
_Avoid_: Owner, payer

**Dashboard**:
The authenticated overview of recent spending, monthly totals, budget usage, and recent transactions.
_Avoid_: Spending Overview, Overview page

**Statement Import**:
The workflow that converts a supported account statement into categorized transactions ready to be saved as expenses.
_Avoid_: File import, transaction import

**Committed Statement Import**:
The persisted provenance record for a Statement Import whose reviewed transactions have been confirmed and saved together. Temporary parsing and review state is not a Committed Statement Import.
_Avoid_: Parsed statement, upload

**Supported Statement**:
A financial account statement whose provider and account format Spendeazy recognizes and whose extracted activity can be reconciled against the statement's control totals.
_Avoid_: Compatible PDF, accepted statement

**Upload**:
The Statement Import stage in which a statement file is selected and processed.
_Avoid_: Import, ingest

**Categorize**:
The Statement Import stage in which parsed transactions are assigned to categories and corrected when necessary.
_Avoid_: Map, update

**Review**:
The Statement Import stage in which categorized transactions and statement totals are checked before confirmation.
_Avoid_: Confirm stage, validation

**Unmapped Transaction**:
A parsed Transaction whose Category could not be determined during Statement Import. It has no match confidence; a user-assigned Category is Manual.
_Avoid_: Unmapped Category, unknown transaction

**Excluded Transaction**:
A parsed Transaction that remains visible during Statement Import but will not be confirmed or included in import summaries.
_Avoid_: Deleted transaction, ignored row

**Transaction**:
A positive expense on an Account, recorded manually or confirmed through Statement Import. It may be assigned a Category.
_Avoid_: Record, statement row

**Account**:
The source through which a Transaction was made. An imported Transaction's Account is identified by its Statement Import's provider and account type; card or wallet identifiers do not define its Account identity. A manual Transaction's Account is Cash.
_Avoid_: Payment Source

**Category**:
A spending classification assigned to a Transaction and used consistently across analysis and budgeting.
_Avoid_: Tag, label

**Category Color**:
A Category's visual identifier, used consistently wherever that Category appears, including historical Transactions, and retained when it is renamed. Multiple Categories may share a Category Color.
_Avoid_: Transaction color, chart color

**Inactive Category**:
A Category retired from future Transaction assignments and Statement Import categorization while retaining its historical Transactions and spending. It can be reactivated for future use.
_Avoid_: Deleted Category, archived Category

**Category Match Confidence**:
The strength of an automatically assigned Category match, expressed from 0 to 1. Unmapped and manually categorized Transactions have no confidence.
_Avoid_: Match percentage, categorization score

**Category Rule**:
A persistent association between a description pattern and a Category, using either Exact or Contains matching during future Statement Imports. Matching ignores case and normalizes whitespace; rules for Inactive Categories do not participate.
_Avoid_: Category mapping, remembered mapping

**Exact Rule**:
A Category Rule whose pattern matches the entire normalized Transaction description. Exact Rules take precedence over Contains Rules.
_Avoid_: Full-text rule

**Contains Rule**:
A Category Rule whose pattern occurs anywhere within the normalized Transaction description, including within a word. Punctuation remains significant.
_Avoid_: Keyword rule, fuzzy rule

**Ambiguous Category Match**:
A match in which the applicable Category Rules identify more than one distinct Category after Exact Rule precedence is applied. The Transaction remains Unmapped until the User assigns a Category.
_Avoid_: Multiple matches, guessed Category

**Budget**:
The single recurring spending limit associated with a Category, over either a monthly or yearly period.
_Avoid_: Allowance, Budget Category

**Reporting Period**:
The calendar month and year used to scope Dashboard, Transaction, and Category figures.
_Avoid_: Active Period, Date Filter

**Default Category**:
A Category copied from the maintained default catalog when a Personal or Shared Space is created. Default describes its origin only; subsequent catalog changes do not alter existing Spaces' Categories.
_Avoid_: System category, built-in category

**Uncategorized**:
The state of a Transaction with no Category assignment. During Statement Import, an Unmapped Transaction is a parsed Transaction awaiting that assignment.
_Avoid_: Unassigned, categoryless

**Exact File Duplicate**:
A statement file whose content hash matches a Committed Statement Import already in the destination Space.
_Avoid_: Duplicate statement

**Probable Duplicate**:
An imported Transaction whose fingerprint matches another reviewed row or a previously imported Transaction in the destination Space. It is a review signal, not proof that the Transactions are identical.
_Avoid_: Duplicate transaction
