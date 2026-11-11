import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmationWarnings } from './confirmation-warnings.ts';
import type { ImportAdvisoryWarning } from './confirmation-contract.ts';

test('duplicate summaries count unique Transactions without changing acknowledgment evidence', () => {
  const warning = (id: string, type: ImportAdvisoryWarning['type'], sourceRowIds: string[], message = 'Match'): ImportAdvisoryWarning =>
    ({ id, type, sourceRowIds, message, expenseIds: [], statementImportIds: [] });
  const input = [warning('file', 'exact_file', []), warning('a', 'probable_duplicate', ['1']),
    warning('b', 'probable_duplicate', ['1', '2']), warning('c', 'probable_duplicate', ['2']),
    warning('r', 'reconciliation', ['1'], 'Control mismatch')];
  const original = JSON.stringify(input);
  const result = confirmationWarnings(input);
  assert.equal(result.length, 3);
  assert.equal(result[0].type, 'exact_file');
  assert.deepEqual(result[1].sourceRowIds, ['1', '2']);
  assert.match(result[1].message, /^2 Transactions may match/);
  assert.equal(result[2].message, 'Control mismatch (1 row)');
  assert.equal(JSON.stringify(input), original);
  assert.match(confirmationWarnings([input[1]])[0].message, /^1 Transaction may match/);
  assert.deepEqual(confirmationWarnings([]), []);
});
