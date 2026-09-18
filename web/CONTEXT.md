# Spendeazy

Spendeazy is a private personal-finance application for understanding spending, importing account statements, and assigning transactions to budget categories.

## Language

**User**:
The person using Spendeazy, whose private financial data belongs only to them.
_Avoid_: API User, internal user, account holder

**Dashboard**:
The authenticated overview of recent spending, monthly totals, budget usage, and recent transactions.
_Avoid_: Spending Overview, Overview page

**Statement Import**:
The workflow that converts a supported account statement into categorized transactions ready to be added to the ledger.
_Avoid_: File import, transaction import

**Committed Statement Import**:
The persisted provenance record for a Statement Import whose reviewed transactions have been confirmed and saved together. Temporary parsing and review state is not a Committed Statement Import.
_Avoid_: Parsed statement, upload

**Supported Statement**:
A financial account statement whose provider and account format Spendeazy recognizes and whose extracted activity can be reconciled against the statement's control totals.
_Avoid_: Compatible PDF, accepted statement

**Upload**:
The Statement Import stage in which a statement file is selected, transferred, and processed.
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
An expense on an Account, recorded manually or confirmed through Statement Import. It may be assigned a Category.
_Avoid_: Record, statement row

**Account**:
The source through which a Transaction was made. An imported Transaction's Account is identified by its Statement Import's provider and account type; Spendeazy does not retain card or wallet identifiers. A manual Transaction's Account is Cash.
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
A recurring spending limit for a Category over a monthly or yearly period.
_Avoid_: Allowance, Budget Category

**Reporting Period**:
The calendar month and year used to scope Dashboard, Transaction, and Category figures.
_Avoid_: Active Period, Date Filter
