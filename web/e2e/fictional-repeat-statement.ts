// Fictional, independently reconciled expenses spanning two calendar months.
export function statementPdf() {
  const lines = [
    "Statement of Account", "BDO AMEX (PHP)", "Statement Date August 31, 2026",
    "Total Amount Due 4.00", "Previous Balance 0.00", "Purchases and Advances (+) 4.00",
    "Finance Charge (+) 0.00", "Fees/Other Debits (+) 0.00", "Late Charge (+) 0.00",
    "Payments/Other Credits (-) 0.00", "Sale Date Post Date Transaction Details Amount",
    "PREVIOUS STATEMENT BALANCE 0.00", "CARD NUMBER 1111-222233-33444",
    "08/01/26 08/02/26 Fictional Repeat 1.00", "08/02/26 08/03/26 FICTIONAL REPEAT 1.00", "08/03/26 08/04/26 Fictional Repeat 1.00", "08/04/26 08/05/26 Fictional Repeat! 1.00",
    "SUBTOTAL 4.00", "TOTAL 4.00",
  ];
  return createFictionalStatementPdf(lines);
}

export function createFictionalStatementPdf(lines: readonly string[]) {
  const stream = `BT /F1 11 Tf 16 TL 40 750 Td\n${lines.map((line) => `(${line.replace(/[\\()]/gu, "\\$&")}) Tj T*`).join("\n")}\nET\n`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const offset = Buffer.byteLength(pdf); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}


