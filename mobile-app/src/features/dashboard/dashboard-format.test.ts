import assert from 'node:assert/strict';
import test from 'node:test';
import { annualUsageText, meterSegments } from './dashboard-format.ts';

test('PHP formatting works when native Intl rejects BigInt and preserves exact digits', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format')!;
  Object.defineProperty(Intl.NumberFormat.prototype, 'format', {
    ...descriptor,
    get() {
      const format = descriptor.get!.call(this);
      return (value: number | bigint) => {
        if (typeof value === 'bigint') throw new TypeError('Cannot convert BigInt to number');
        return format(value);
      };
    },
  });
  try {
    // Load a fresh formatter under the native-runtime restriction, not Node's cached instance.
    const moduleUrl = new URL('./dashboard-format.ts?native-intl-regression', import.meta.url).href;
    const { formatPhp } = await import(moduleUrl);
    assert.equal(formatPhp('30000.01'), '₱30,000.01');
    assert.equal(formatPhp('9007199254740993.01'), '₱9,007,199,254,740,993.01');
    assert.equal(formatPhp('-1234.50'), '-₱1,234.50');
    assert.equal(formatPhp('0.00'), '₱0.00');
    assert.equal(formatPhp('0001234'), '₱1,234.00');
    assert.throws(() => formatPhp('12.345'), /exact decimals/);
  } finally {
    Object.defineProperty(Intl.NumberFormat.prototype, 'format', descriptor);
  }
});

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
