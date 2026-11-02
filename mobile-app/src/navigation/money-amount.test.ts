import assert from 'node:assert/strict';
import test from 'node:test';

import { displayMoneyAmount } from './money-amount.ts';

test('shows API decimals with thousands separators and preserves a one-cent remainder', () => {
  assert.equal(displayMoneyAmount('400.01'), '400.01');
  assert.equal(displayMoneyAmount('1000'), '1,000');
});
