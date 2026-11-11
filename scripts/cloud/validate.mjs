import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_POSTGRES_TEST_DATABASES } from '../../api/scripts/run-required-postgres-tests.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = new Set(process.argv.slice(2));
for (const option of options) {
  if (!['--bundle', '--migration-image'].includes(option)) throw new Error(`Unknown option: ${option}`);
}
const state = process.env.SPENDEAZY_CLOUD_STATE;
if (!state) throw new Error('Run through scripts/cloud/validate.sh.');
const logs = resolve(state, 'logs', `${Date.now()}-${randomBytes(3).toString('hex')}`);
mkdirSync(logs, { recursive: true });
console.log(`Validation logs: ${logs}`);
const results = [];
let container;
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
function docker(args) {
  const result = spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env: dockerEnv, encoding: 'utf8', timeout: 120_000,
  });
  if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed: ${result.error?.message ?? result.stderr?.trim()}`);
  return result.stdout.trim();
}
function run(name, directory, command, args, env = process.env) {
  const started = Date.now();
  const fd = openSync(resolve(logs, `${name}.log`), 'w');
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: resolve(root, directory), env, stdio: ['ignore', fd, fd], timeout: 20 * 60 * 1000,
    });
  } finally { closeSync(fd); }
  const passed = !result.error && result.status === 0;
  results.push({ name, passed, seconds: (Date.now() - started) / 1000, error: result.error?.message });
  console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}
try {
  run('release-gates', '.', 'node', ['scripts/verify-release-gates.mjs']);
  run('api-lint', 'api', 'npx', ['--no-install', 'eslint', '{src,apps,libs,test}/**/*.ts']);
  run('api-build', 'api', 'npm', ['run', 'build']);
  run('api-unit', 'api', 'npm', ['test', '--', '--runInBand']);
  run('api-contract', 'api', 'npm', ['run', 'openapi:check']);
  run('mobile-parser', 'mobile-app', 'npm', ['run', 'statement-import:test']);
  run('mobile-lint', 'mobile-app', 'npm', ['run', 'lint']);
  run('mobile-types', 'mobile-app', 'npm', ['run', 'typecheck']);
  run('mobile-unit', 'mobile-app', 'npm', ['test']);
  try {
    docker(['info']);
    const name = `spendeazy-validation-${randomBytes(6).toString('hex')}`;
    const label = 'spendeazy.cloud-validation';
    // Record ownership before creation so interrupted readiness checks still clean up.
    container = name;
    docker(['run', '-d', '--name', name, '--label', label, '-e', 'POSTGRES_USER=validation',
      '-e', 'POSTGRES_PASSWORD=validation_local_only', '-e', 'POSTGRES_DB=validation',
      '-p', '127.0.0.1::5432', '--health-cmd', 'pg_isready -U validation -d validation',
      '--health-interval', '1s', '--health-retries', '30', 'postgres:16-alpine']);
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      if (docker(['inspect', '-f', '{{.State.Health.Status}}', name]) === 'healthy') { healthy = true; break; }
      await new Promise((done) => setTimeout(done, 1000));
    }
    if (!healthy) throw new Error('Disposable PostgreSQL did not become healthy.');
    const port = docker(['port', name, '5432/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error('Unexpected PostgreSQL port mapping.');
    const env = { ...process.env };
    for (const [i, key] of REQUIRED_POSTGRES_TEST_DATABASES.entries()) {
      const database = `suite_${i}`;
      docker(['exec', name, 'createdb', '-U', 'validation', database]);
      env[key] = `postgres://validation:validation_local_only@127.0.0.1:${port}/${database}`;
    }
    run('api-postgres', 'api', 'npm', ['run', 'test:postgres'], env);
  } catch (error) {
    results.push({ name: 'api-postgres-setup', passed: false, error: error.message });
    console.error(`api-postgres setup: FAIL (${error.message})`);
  }
  if (options.has('--bundle')) run('android-bundle', 'mobile-app', 'npx', [
    '--no-install', 'expo', 'export', '--platform', 'android', '--output-dir', resolve(logs, 'android-export'),
  ]);
  if (options.has('--migration-image')) run('migration-image', 'api', 'npm', ['run', 'test:migration-image'], dockerEnv);
} finally {
  if (container) {
    try { docker(['rm', '-f', '-v', container]); }
    catch (error) { results.push({ name: 'database-cleanup', passed: false, error: error.message }); }
  }
  writeFileSync(resolve(logs, 'results.json'), JSON.stringify(results, null, 2) + '\n');
}
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
