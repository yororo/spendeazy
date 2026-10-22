// Fictional ledger only. Run after parser:prepare; no private statement input.
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformStatement } from '../.expo/parser-proof-transformer.mjs';

const controls = [
  ['Previous Balance', '1000.00'],
  ['Plus: Purchases/Debits', '200.00'],
  ['Cash Advances', '0.00'],
  ['Installment', '100.00'],
  ['Fees/Charges', '10.00'],
  ['Less: Payments', '500.00'],
  ['Credits', '20.00'],
  ['Total Statement Balance', '790.00'],
];
const activity = [
  'YOUR CARD ACTIVITIES',
  'Jan 05 Jan 06 FICTIONAL PURCHASE 200.00',
  'Jan 07 Jan 07 FICTIONAL INSTALLMENT 100.00',
  'Jan 08 Jan 08 FICTIONAL FEE 10.00',
  'Jan 09 Jan 09 FICTIONAL PAYMENT -500.00',
  'Jan 10 Jan 10 FICTIONAL CREDIT -20.00',
];
function statement(format = label => label, rows = controls) {
  return [
    'EastWest Visa PHP', 'Statement Date Jan 15 2026',
    ...rows.map(([label, amount]) => `${format(label)}   ${amount}`),
    ...activity,
  ].join('\n');
}
function expectLedger(text) {
  const result = transformStatement(text);
  assert.equal(result.summary.provider, 'EastWest');
  assert.equal(result.summary.totalTransactions, 5);
  assert.equal(result.summary.totalAmountDue, 790);
  assert.equal(result.summary.totalExtractedAmount, -210);
  assert.deepEqual(result.transactions.map(row => row.amount), [200, 100, 10, -500, -20]);
  assert.equal(result.transactions[0].transactionDate.toISOString(), '2026-01-05T00:00:00.000Z');
  assert.equal(result.transactions[0].postingDate.toISOString(), '2026-01-06T00:00:00.000Z');
}
test('EastWest fictional ledger retains signs, dates and reconciled controls', () => {
  expectLedger(statement());
});
test('EastWest reads Plus:   Purchases/Debits from separate PDF text runs', () => {
  expectLedger(statement(label => label === 'Plus: Purchases/Debits' ? 'Plus:   Purchases/Debits' : label));
});
test('EastWest controls tolerate PDF text runs separated by multiple spaces', () => {
  expectLedger(statement(label => label.replaceAll(' ', '   ')));
});
test('EastWest controls tolerate tabs and nonbreaking spaces', () => {
  expectLedger(statement(label => label.replaceAll(' ', '\t\u00a0')));
});
test('EastWest still rejects a genuinely missing purchases control', () => {
  assert.throws(() => transformStatement(statement(undefined, controls.filter(([label]) => label !== 'Plus: Purchases/Debits'))), /missing Plus: Purchases\/Debits control/u);
});
test('EastWest still rejects a malformed control amount', () => {
  const rows = controls.map(([label, amount]) => [label, label === 'Plus: Purchases/Debits' ? 'invalid' : amount]);
  assert.throws(() => transformStatement(statement(undefined, rows)), /invalid amount for Plus: Purchases\/Debits/u);
});
test('EastWest retains reconciliation failures when control values disagree', () => {
  const rows = controls.map(([label, amount]) => [label, label === 'Total Statement Balance' ? '791.00' : amount]);
  assert.throws(() => transformStatement(statement(undefined, rows)), /Previous Balance plus net activity does not match/u);
});
