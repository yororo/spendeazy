import assert from 'node:assert/strict';
import test from 'node:test';
import { annualUsageText, meterSegments } from './dashboard-format.ts';

test('cumulative meters preserve allocation and isolate excess with bounded zero geometry', () => {
  assert.deepEqual(meterSegments('200.00', '400.00'), { allocation: 50, excess: 0 });
  assert.deepEqual(meterSegments('400.00', '400.00'), { allocation: 100, excess: 0 });
  assert.deepEqual(meterSegments('500.00', '400.00'), { allocation: 80, excess: 20 });
  assert.deepEqual(meterSegments('0.00', '400.00'), { allocation: 0, excess: 0 });
  assert.deepEqual(meterSegments('0.00', '0.00'), { allocation: 0, excess: 0 });
  assert.deepEqual(meterSegments('500.00', '0.00'), { allocation: 0, excess: 0 });
  const slight = meterSegments('400.01', '400.00');
  assert.ok(slight.allocation > 99 && slight.allocation < 100);
  assert.ok(slight.excess > 0 && slight.excess < 1);
});

test('annual usage keeps exact one-cent overage even when the percentage rounds to 100.0', () => {
  assert.equal(annualUsageText('319.99', '400.00'), '80.0% used');
  assert.equal(annualUsageText('320.00', '400.00'), '80.0% used');
  assert.equal(annualUsageText('400.00', '400.00'), '100.0% used');
  assert.equal(annualUsageText('400.01', '400.00'), '100.0% used · ₱0.01 over');
  assert.equal(annualUsageText('500.00', '400.00'), '125.0% used · ₱100.00 over');
  assert.equal(annualUsageText('0.00', '0.00'), 'No plan set');
});
