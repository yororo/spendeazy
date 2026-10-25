import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { requireMobileChecks } from './verify-release-gates.mjs';

const require = createRequire(new URL('../api/package.json', import.meta.url));
const { load } = require('js-yaml');

test('release-gate verifier rejects a mobile workflow that omits application tests', () => {
  const workflow = load(readFileSync(new URL('./fixtures/ci-mobile-omits-application-tests.yml', import.meta.url), 'utf8'));
  assert.throws(
    () => requireMobileChecks(workflow.jobs.mobile),
    /Mobile validation is missing npm test/,
  );
});
