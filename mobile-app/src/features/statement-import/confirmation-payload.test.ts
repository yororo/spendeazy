import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { confirmationHandoff } from './confirmation.fixture.ts';
import { serializeConfirmation } from './confirmation-payload.ts';

test('mixed ledger serializes losslessly to the API golden fixture, preserving original warnings', () => {
  const payload = serializeConfirmation(confirmationHandoff());
  assert.deepEqual(payload, JSON.parse(readFileSync(new URL('./fixtures/confirmation.json', import.meta.url), 'utf8')));
  assert.deepEqual(payload.expenses.map(row => row.amount), ['1000.00', '300.00']);
  assert.equal(payload.excluded.length, 8);
  assert.equal(payload.evidence.controlTotals[1].amount, null);
  assert.equal(payload.evidence.reconciliation.comparisons[0].extractedAmount, '9500.00');
  assert.equal(payload.evidence.transactions[6].normalized.amount, null);
  assert.equal(payload.evidence.transactions[7].normalized.date, null);
  assert.equal(payload.evidence.transactions[8].classification, 'invalid_amount');
  assert.equal(JSON.stringify(payload).includes('recognitionEvidence'), false);
});

test('serializer rejects incomplete, duplicate, unknown, overlapping and automatic included dispositions', () => {
  const fixture = confirmationHandoff();
  for (const rows of [fixture.rows.slice(1), [...fixture.rows, fixture.rows[0]], [...fixture.rows.slice(1), { ...fixture.rows[0], sourceRowId: 'unknown' }], fixture.rows.map((row, i) => i === 2 ? { ...row, inclusion: 'included' as const, amount: '5000.00' } : row), fixture.rows.map(row => ({ ...row, inclusion: 'user-excluded' as const }))]) {
    assert.throws(() => serializeConfirmation({ ...fixture, rows }));
  }
});

test('matching source retains the applied Exact/Contains mode after unrelated catalog changes', () => {
  const fixture = confirmationHandoff();
  const rows = fixture.rows.map((row, i) => i === 0 ? { ...row, assignment: { origin: 'rule' as const, ruleIds: ['staged'], categoryRevision: '1', rulesRevision: '1', matchType: 'contains' as const } } : row);
  assert.equal(serializeConfirmation({ ...fixture, rows }).evidence.transactions[0].matchingSource, 'contains');
  assert.equal(serializeConfirmation({ ...fixture, rows, stagedRules: [] }).evidence.transactions[0].matchingSource, 'contains');
  assert.equal(serializeConfirmation({ ...fixture, rows: rows.map(row => row.assignment?.origin === 'rule' ? { ...row, assignment: { ...row.assignment, matchType: 'exact' } } : row) }).evidence.transactions[0].matchingSource, 'exact');
});

test('provider tuples and bigint amounts cross JSON without floating point', () => {
  const fixture = confirmationHandoff();
  for (const account of [{ provider: 'bdo', format: 'amex', statementType: 'credit-card' }, { provider: 'eastwest', format: 'visa', statementType: 'credit-card' }] as const) {
    const payload = serializeConfirmation({ ...fixture, original: { ...fixture.original, account, dates: { statementDate: '2026-09-30', historyPeriod: null } }, rows: fixture.rows.map((row, i) => i === 0 ? { ...row, amount: '9999999999999.99' } : row) });
    assert.equal(payload.statement.accountFormat, account.format);
    assert.equal(payload.statement.statementType, 'credit_card');
    assert.equal(payload.expenses[0].amount, '9999999999999.99');
    assert.ok(payload.evidence.transactions.every(row => !('duplicateReference' in row)));
    assert.doesNotThrow(() => JSON.stringify(payload));
  }
});
