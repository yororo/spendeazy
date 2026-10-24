import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments } from './local-test-launcher.mjs';

test('the isolated launcher exposes only API/PostgreSQL execution and help', () => {
  assert.deepEqual(parseArguments(['--api-postgres']), { mode: 'api-postgres' });
  assert.deepEqual(parseArguments(['--help']), { mode: 'help' });
  assert.throws(() => parseArguments(['--e2e']), /--api-postgres/);
  assert.throws(() => parseArguments(['--reset']), /--api-postgres/);
  assert.throws(() => parseArguments(['--api-postgres', '--reset']), /--api-postgres/);
});
