import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretStatement, InterpretationFailure } from './providers.ts';
import { cardDate, decimalAmount, minorUnits, parseDate } from './values.ts';

const file = { name: 'fictional.pdf', byteCount: 100, sha256: 'fictional-hash' };
const owner = { userId: 'u', spaceId: 's' };
function interpret(text: string, extra: Parameters<typeof interpretStatement>[0]['pages'] = []) {
  return interpretStatement({ file, owner, draftId: 'd', pages: [{ pageIndex: 0, outcome: 'text', text, hasImages: false }, ...extra] });
}
const bdo = [
  'BDO AMEX PHP', 'Statement Date January 15, 2026',
  'Previous Balance 500.00', 'Total Amount Due 1300.00', 'Purchases and Advances (+) 1300.00',
  'Finance Charge (+) 0.00', 'Fees/Other Debits (+) 0.00', 'Late Charge (+) 0.00', 'Payments/Other Credits (-) 500.00',
  'PREVIOUS STATEMENT BALANCE 500.00', 'CARD NUMBER XXXX', 'Sale Date Post Date Transaction Details Amount',
  '01/01/26 01/02/26 FICTIONAL PURCHASE 1000.00', 'Reference:', 'fictional-ref',
  '01/03/26 01/03/26 FICTIONAL TRANSFER 300.00',
  '01/04/26 01/04/26 FICTIONAL PAYMENT -400.00', '01/05/26 01/05/26 FICTIONAL REFUND -100.00',
  'SUBTOTAL 1300.00', 'TOTAL 1300.00',
].join('\n');
const eastwest = [
  'EastWest Visa PHP', 'Statement Date Jan 15 2026', 'Previous Balance 500.00',
  'Plus:   Purchases/Debits 1300.00', 'Cash Advances 0.00', 'Installment 0.00', 'Fees/Charges 0.00',
  'Less: Payments 400.00', 'Credits 100.00', 'Total Statement Balance 1300.00', 'YOUR CARD ACTIVITIES',
  'Dec 31 Jan 01 FICTIONAL PURCHASE 1000.00', 'Jan 03 Jan 03 FICTIONAL TRANSFER 300.00',
  'Jan 04 Jan 04 FICTIONAL PAYMENT -400.00', 'Jan 05 Jan 05 FICTIONAL REFUND -100.00',
].join('\n');
const gcash = [
  'GCash Transaction History', '2026-01-01 to 2026-01-15', 'STARTING BALANCE 2000.00',
  'ENDING BALANCE 1200.00', 'Total Debit 1300.00', 'Total Credit 500.00',
  'Date and Time Description Reference No. Debit Credit Balance',
  '2026-01-01 09:00 AM FICTIONAL PURCHASE 1001 1000.00 1000.00',
  '2026-01-03 09:00 AM FICTIONAL TRANSFER', '1002 300.00 700.00',
  '2026-01-04 09:00 AM FICTIONAL CASH IN 1003 400.00 1100.00',
  '2026-01-05 09:00 AM FICTIONAL REFUND 1004 100.00 1200.00',
].join('\n');
for (const [provider, text] of [['bdo', bdo], ['eastwest', eastwest], ['gcash', gcash]]) {
  test(`${provider}: independently expected ledger preserves 1300 spending and excluded credits`, () => {
    const result = interpret(text);
    assert.equal(result.account.provider, provider);
    assert.deepEqual(result.rows.map(row => row.signedActivityMinor), [100000n, 30000n, -40000n, -10000n]);
    assert.equal(result.rows.reduce((sum, row) => sum + (row.classification.eligible ? row.classification.expenseMinor : 0n), 0n), 130000n);
    assert.equal(result.reconciliation.outcome, 'matched');
    assert.equal(result.completeness.assessment, 'uncertain');
    assert.ok(result.warnings.some(warning => warning.code === 'uncertain-completeness'));
    assert.equal('text' in result.pages[0], false);
  });
}
test('mismatched controls retain usable rows and an advisory warning', () => {
  const result = interpret(eastwest.replace('Total Statement Balance 1300.00', 'Total Statement Balance 1300.01'));
  assert.equal(result.rows.length, 4);
  assert.equal(result.reconciliation.outcome, 'mismatch');
  assert.equal(result.reconciliation.differenceMinor, -1n);
});
test('BDO subtotal disagreement stays advisory and preserves original subtotal evidence', () => {
  const result = interpret(bdo.replace('SUBTOTAL 1300.00', 'SUBTOTAL 1300.01'));
  assert.equal(result.rows.length, 4);
  assert.equal(result.reconciliation.outcome, 'mismatch');
  assert.equal(result.controls.find(control => control.sourceLabel === 'SUBTOTAL')?.originalValue, '1300.01');
});
test('dates remain date-only across New Year; wrapped references and duplicates survive', () => {
  assert.equal(interpret(eastwest).rows[0].date, '2025-12-31');
  assert.equal(interpret(bdo).rows[0].reference, 'fictional-ref');
  const result = interpret(bdo.replace('SUBTOTAL', '01/03/26 01/03/26 FICTIONAL TRANSFER 300.00\nSUBTOTAL'));
  assert.equal(result.rows.length, 5);
  assert.equal(new Set(result.rows.map(row => row.sourceRowId)).size, 5);
});
test('GCash direction is never inferred from incoming-looking descriptions', () => {
  const result = interpret(gcash.replace('STARTING BALANCE 2000.00', 'STARTING BALANCE 9999.00').replace('FICTIONAL PURCHASE', 'Received refund'));
  assert.equal(result.rows[0].signedActivityMinor, null);
  assert.deepEqual(result.rows[0].classification, { eligible: false, reason: 'unknown-direction' });
  assert.equal(result.rows[1].signedActivityMinor, 30000n);
  assert.equal(result.reconciliation.outcome, 'unavailable');
});
test('GCash explicit debit/credit columns establish direction independently of description', () => {
  const result = interpret(gcash.replace('1001 1000.00 1000.00', '1001 1000.00 0.00 1000.00'));
  assert.equal(result.rows[0].signedActivityMinor, 100000n);
  assert.equal(result.rows[0].evidence[0].kind, 'debit-credit-column');
});
test('partial pages keep usable rows and exact failure indices; blanks do not imply missing activity', () => {
  const result = interpret(eastwest, [
    { pageIndex: 1, outcome: 'blank', text: '', hasImages: false },
    { pageIndex: 2, outcome: 'failed', text: '', hasImages: false },
    { pageIndex: 3, outcome: 'unreadable', text: '', hasImages: true },
  ]);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(result.completeness.failedPageIndices, [2]);
  assert.deepEqual(result.completeness.unreadablePageIndices, [3]);
  assert.equal(result.completeness.assessment, 'partial');
  assert.equal(interpret(eastwest, [{ pageIndex: 1, outcome: 'blank', text: '', hasImages: false }]).completeness.assessment, 'uncertain');
});
test('unrecognized, ambiguous, non-PHP and rowless statements fail safely', () => {
  for (const text of ['Unknown provider', `${bdo}\nEastWest Visa PHP`, bdo.replace('BDO AMEX PHP', 'BDO AMEX PHP dual-currency'), 'GCash Transaction History']) {
    assert.throws(() => interpret(text), InterpretationFailure);
  }
});
test('money remains exact above Number safe range and calendar dates reject impossible days', () => {
  assert.equal(decimalAmount(minorUnits('90,071,992,547,409.91')!), '90071992547409.91');
  assert.equal(decimalAmount(minorUnits('(0.01)')!), '-0.01');
  assert.equal(minorUnits('1,00.00'), null);
  assert.equal(parseDate('2025-02-29'), null);
  assert.equal(parseDate('2024-02-29'), '2024-02-29');
  assert.equal(parseDate('Januarygarbage 1, 2026'), null);
  assert.equal(cardDate('Feb 29', '2025-03-01'), null);
});
