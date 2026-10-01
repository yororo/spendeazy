# Fictional spending journey statements

These PDFs contain invented provider-formatted activity and a dummy card number.
They contain no User statement or private evidence. The unencrypted and encrypted
files contain the same independently reconciled statement:

| Expense date | Description | PHP |
| --- | --- | --- |
| 2026-07-31 | Fictional Journey | 1,000.00 |
| 2026-08-01 | FICTIONAL JOURNEY | 400.00 |
| 2026-08-02 | Fictional Journey | 400.00 |
| 2026-08-03 | Fictional Separate | 200.01 |

Previous balance and credits are zero. Purchases, subtotal, total and amount due
are PHP 2,000.01. July expenses total PHP 1,000.00; August expenses total
PHP 1,000.01. Against a PHP 1,000 monthly Budget these are At Budget Limit and
Over Budget respectively. Against PHP 1,250 August is Nearing Budget.

`spending-journey.pdf` uses the minimal PDF writer in
`../fictional-repeat-statement.ts`. `spending-journey-encrypted.pdf` was created
from it with pypdf's `PdfWriter.append_pages_from_reader`, then
`encrypt("fictional-journey-only", algorithm="RC4-128")` and `write`.
The password is public fictional test data. Encryption is deliberately compatible
with the browser's real PDF reader. Tests consume committed bytes and require
no Python or PDF generation dependency at runtime.
