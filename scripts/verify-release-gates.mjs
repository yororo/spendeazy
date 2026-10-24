import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../api/package.json', import.meta.url));
const { load } = require('js-yaml');
const deploy = load(readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8'));
const publish = load(readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8'));
const ci = load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const mobilePackage = JSON.parse(readFileSync(new URL('../mobile-app/package.json', import.meta.url), 'utf8'));
const releaseDocs = readFileSync(new URL('../docs/releases.md', import.meta.url), 'utf8');

function permitted(jobName, { event = 'push', validation = 'success', changed = 'true', migrate = 'success', verifyOnly = false, cancelled = false } = {}) {
  const job = publish.jobs[jobName];
  const needs = {
    changes: { result: 'success', outputs: { api: changed } },
    migrate: { result: migrate, outputs: { digest: 'sha256:digest' } },
  };
  const expression = job.if;
  if (!expression.includes('always()') && (validation !== 'success' || cancelled)) return false;
  return Boolean(new Function('github', 'inputs', 'needs', 'always', 'cancelled', `return (${expression});`)(
    { event_name: event }, { validated: validation === 'success', verify_only: verifyOnly }, needs, () => true, () => cancelled,
  ));
}

assert.deepEqual(Object.keys(ci.jobs).sort(), ['api', 'mobile', 'preflight', 'validate']);
assert.deepEqual(ci.jobs.validate.needs, ['preflight', 'api', 'mobile']);
assert.equal(ci.jobs.validate.if, 'always()');
assert.equal(ci.jobs.validate.steps[0].run.includes('all(.[]; .result == "success")'), true);
assert.equal(deploy.jobs.validate.uses, './.github/workflows/ci.yml');
assert.equal(deploy.jobs.gate.name, 'Validate API, PostgreSQL and mobile');
assert.equal(deploy.jobs.gate.if, 'always()');
assert.deepEqual(ci.jobs.api.needs, ['preflight']);
assert.equal(ci.jobs.api.services.postgres.image, 'postgres:16-alpine');
for (const name of [
  'TEST_SPACES_DATABASE_URL',
  'TEST_CATEGORY_RULES_DATABASE_URL',
  'TEST_CATEGORY_COLOR_DATABASE_URL',
  'TEST_SPACE_CATEGORIES_CONCURRENCY_DATABASE_URL',
  'TEST_STATEMENT_IMPORT_ROLLBACK_DATABASE_URL',
  'TEST_STATEMENT_IMPORT_CATEGORY_CONCURRENCY_DATABASE_URL',
  'TEST_EXPENSE_STATEMENT_IMPORT_SPACE_DATABASE_URL',
  'TEST_INVITATIONS_DATABASE_URL',
  'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL',
]) assert.ok(ci.jobs.api.env[name], `Required PostgreSQL database missing for ${name}`);
assert.notEqual(
  ci.jobs.api.env.TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL,
  ci.jobs.api.env.TEST_SPACES_DATABASE_URL,
);
assert.equal(
  new Set(Object.values(ci.jobs.api.env)).size,
  Object.values(ci.jobs.api.env).length,
  'Every required API PostgreSQL suite must have a unique database URL',
);
assert.ok(ci.jobs.api.steps.some(step => step.run === 'npm run test:postgres'));
for (const command of ['npx eslint', 'npm run build', 'npm test -- --runInBand', 'npm run openapi:check']) {
  assert.ok(ci.jobs.api.steps.some(step => step.run?.includes(command)), `API validation is missing ${command}`);
}
assert.ok(ci.jobs.mobile.steps.some(step => step.run === 'npm run lint'));
assert.ok(ci.jobs.mobile.steps.some(step => step.run === 'npm run typecheck'));
assert.ok(ci.jobs.mobile.steps.some(step => step.run === 'npm run parser:test'));
assert.equal(mobilePackage.scripts.web, undefined);
assert.ok(mobilePackage.scripts.typecheck);

assert.deepEqual(Object.keys(publish.jobs).sort(), ['api', 'changes', 'migrate']);
assert.equal(publish.jobs.changes.steps.some(step => step.run?.includes('test "$GITHUB_REF" = refs/heads/main')), true);
assert.equal(publish.jobs.changes.steps.some(step => step.run === 'node scripts/release-plan.mjs'), true);
assert.deepEqual(publish.jobs.migrate.needs, ['changes']);
assert.deepEqual(publish.jobs.api.needs, ['changes', 'migrate']);
assert.equal(publish.jobs.migrate.outputs.digest, '${{ steps.image.outputs.digest }}');
const apiImage = publish.jobs.migrate.steps.find(step => step.name === 'Build and publish API image');
assert.equal(apiImage.with.tags, 'syoro/spendeazy-api:${{ github.sha }}');
const migration = publish.jobs.migrate.steps.find(step => step.name === 'Run migrations with the published image');
assert.equal(migration.env.MIGRATION_IMAGE, 'syoro/spendeazy-api@${{ steps.image.outputs.digest }}');
const apiDeploy = publish.jobs.api.steps.find(step => step.name === 'Deploy migration-tested container image');
assert.equal(apiDeploy.with.imageToDeploy, 'syoro/spendeazy-api@${{ needs.migrate.outputs.digest }}');
for (const validation of ['failure', 'cancelled', 'skipped', 'pending']) {
  assert.equal(permitted('migrate', { validation }), false);
  assert.equal(permitted('api', { validation }), false);
}
for (const migrate of ['failure', 'cancelled', 'pending', 'skipped']) {
  assert.equal(permitted('api', { migrate }), false);
}
assert.equal(permitted('migrate', { event: 'push', changed: 'false' }), false);
assert.equal(permitted('api', { event: 'push', changed: 'false', migrate: 'skipped' }), false);
assert.equal(permitted('migrate', { event: 'workflow_dispatch', verifyOnly: true, changed: 'true' }), false);
assert.equal(permitted('api', { event: 'workflow_dispatch', verifyOnly: true, migrate: 'skipped' }), true);
assert.equal(permitted('api', { event: 'workflow_dispatch', verifyOnly: false, migrate: 'success' }), true);

for (const workflow of [deploy, publish, ci]) {
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses) assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/, `Unpinned action ${step.uses}`);
    }
  }
}
const workflowSource = ['../.github/workflows/ci.yml', '../.github/workflows/deploy.yml', '../.github/workflows/publish.yml']
  .map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
assert.doesNotMatch(workflowSource, /web_artifact|staticwebapps-deploy|Playwright|Vite|browser suite|web\/dist/iu);
assert.match(releaseDocs, /#138/u);
assert.match(releaseDocs, /physical iPhone/u);
assert.match(releaseDocs, /Android emulator/u);
assert.match(releaseDocs, /native build/u);
assert.match(releaseDocs, /lint and type checks do not establish device certification/iu);
console.log('Release gates verified: isolated API/PostgreSQL checks, mobile/parser checks, current-source API deployment, and blocking migration safeguards.');
