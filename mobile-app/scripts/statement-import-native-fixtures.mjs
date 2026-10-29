// Fictional native walkthrough inputs, generated into ignored .expo only.
import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../.expo/statement-import-fixtures/', import.meta.url);
await mkdir(directory, { recursive: true });
const fixtures = {
  bdo: ['BDO AMEX PHP', 'Statement Date January 15, 2026', 'Previous Balance 500.00', 'Total Amount Due 1300.00',
    'Purchases and Advances (+) 1300.00', 'Finance Charge (+) 0.00', 'Fees/Other Debits (+) 0.00', 'Late Charge (+) 0.00',
    'Payments/Other Credits (-) 500.00', 'PREVIOUS STATEMENT BALANCE 500.00', 'CARD NUMBER XXXX',
    '01/01/26 01/02/26 FICTIONAL PURCHASE 1000.00', '01/03/26 01/03/26 FICTIONAL TRANSFER 300.00',
    '01/04/26 01/04/26 FICTIONAL PAYMENT -500.00', 'SUBTOTAL 1300.00', 'TOTAL 1300.00'],
  eastwest: ['EastWest Visa PHP', 'Statement Date Jan 15 2026', 'Previous Balance 500.00', 'Plus: Purchases/Debits 1300.00',
    'Cash Advances 0.00', 'Installment 0.00', 'Fees/Charges 0.00', 'Less: Payments 500.00', 'Credits 0.00',
    'Total Statement Balance 1300.00', 'YOUR CARD ACTIVITIES', 'Dec 31 Jan 01 FICTIONAL PURCHASE 1000.00',
    'Jan 03 Jan 03 FICTIONAL TRANSFER 300.00', 'Jan 04 Jan 04 FICTIONAL PAYMENT -500.00'],
  gcash: ['GCash Transaction History', '2026-01-01 to 2026-01-15', 'STARTING BALANCE 2000.00', 'ENDING BALANCE 1200.00',
    'Total Debit 1300.00', 'Total Credit 500.00', 'Date and Time Description Reference No. Debit Credit Balance',
    '2026-01-01 09:00 AM FICTIONAL PURCHASE 1001 1000.00 1000.00', '2026-01-03 09:00 AM FICTIONAL TRANSFER 1002 300.00 700.00',
    '2026-01-04 09:00 AM FICTIONAL CASH IN 1003 500.00 1200.00'],
  unsupported: ['Fictional unsupported provider', 'No supported statement identity'],
};
function pdf(lines) {
  const escape = text => text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = `BT /F1 9 Tf 30 760 Td 15 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let output = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return output;
}
for (const [name, lines] of Object.entries(fixtures)) await writeFile(new URL(`fictional-${name}.pdf`, directory), pdf(lines));
await writeFile(new URL('fictional-corrupt.pdf', directory), '%PDF-1.4\nfictional corrupt input');
console.log('Generated fictional Statement Import PDFs in .expo/statement-import-fixtures/');
