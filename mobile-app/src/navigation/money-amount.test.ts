import assert from 'node:assert/strict';
import test from 'node:test';

import { displayMoneyAmount } from './money-amount.ts';

test('shows the API decimal exactly, including a one-cent remainder', () => {
  assert.equal(displayMoneyAmount('400.01'), '400.01');
  assert.equal(displayMoneyAmount('1000'), '1000');
});
