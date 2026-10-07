import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suffix = randomBytes(5).toString('hex');
const networkName = `spendeazy-migration-${suffix}`;
const databaseContainerName = `${networkName}-db`;
const imageName = `spendeazy-api-migration-test:${suffix}`;
const databaseUser = 'spendeazy_migration_test';
const databasePassword = randomBytes(18).toString('hex');
const databaseName = 'spendeazy_migration_test';
const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@${databaseContainerName}:5432/${databaseName}`;

let networkCreated = false;
let databaseStarted = false;
let imageBuilt = false;

try {
  await run('docker', ['network', 'create', networkName]);
  networkCreated = true;

  await run('docker', [
    'run',
    '--detach',
    '--name',
    databaseContainerName,
    '--network',
    networkName,
    '--env',
    `POSTGRES_USER=${databaseUser}`,
    '--env',
    `POSTGRES_PASSWORD=${databasePassword}`,
    '--env',
    `POSTGRES_DB=${databaseName}`,
    'postgres:16-alpine',
  ]);
  databaseStarted = true;

  await waitForDatabase();

  await run(
    'docker',
    ['build', '--tag', imageName, '--file', 'Dockerfile', '.'],
    { cwd: apiDirectory },
  );
  imageBuilt = true;

  const expectedMigrationCount = Number(
    await capture('docker', [
      'run',
      '--rm',
      '--network',
      networkName,
      imageName,
      'node',
      '-e',
      "require('reflect-metadata'); const { DATABASE_MIGRATIONS } = require('./dist/database/database-options.js'); process.stdout.write(String(DATABASE_MIGRATIONS.length));",
    ]),
  );

  if (!Number.isInteger(expectedMigrationCount) || expectedMigrationCount < 1) {
    throw new Error('The runtime image did not expose its compiled migration set.');
  }

  const concurrentRuns = await Promise.allSettled([
    runMigration(),
    runMigration(),
  ]);
  const failedRun = concurrentRuns.find((result) => result.status === 'rejected');
  if (failedRun?.status === 'rejected') {
    throw failedRun.reason;
  }

  const firstMigrationCount = await readAppliedMigrationCount();
  assertMigrationCount(firstMigrationCount, expectedMigrationCount, 'first run');

  await runMigration();
  const repeatedMigrationCount = await readAppliedMigrationCount();
  assertMigrationCount(
    repeatedMigrationCount,
    firstMigrationCount,
    'repeat run',
  );

  await expectMigrationFailure();
  console.log(
    `Runtime migration image verified: ${expectedMigrationCount} migrations applied once, concurrent/repeat runs succeeded, and invalid database credentials failed safely.`,
  );
} catch (error) {
  console.error(`Runtime migration image verification failed: ${formatError(error)}`);
  process.exitCode = 1;
} finally {
  if (databaseStarted) {
    await cleanup('docker', ['rm', '--force', databaseContainerName]);
  }
  if (networkCreated) {
    await cleanup('docker', ['network', 'rm', networkName]);
  }
  if (imageBuilt) {
    await cleanup('docker', ['image', 'rm', imageName]);
  }
}

async function runMigration() {
  await run('docker', [
    'run',
    '--rm',
    '--network',
    networkName,
    '--env',
    'NODE_ENV=production',
    '--env',
    `DATABASE_URL=${databaseUrl}`,
    imageName,
    'node',
    'dist/database/migrate.js',
  ]);
}

async function expectMigrationFailure() {
  const invalidDatabaseUrl =
    `postgresql://${databaseUser}:incorrect-password@${databaseContainerName}:5432/${databaseName}`;

  try {
    await run('docker', [
      'run',
      '--rm',
      '--network',
      networkName,
      '--env',
      'NODE_ENV=production',
      '--env',
      `DATABASE_URL=${invalidDatabaseUrl}`,
      imageName,
      'node',
      'dist/database/migrate.js',
    ]);
  } catch {
    return;
  }

  throw new Error('The migration runner succeeded with invalid database credentials.');
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run('docker', [
        'exec',
        databaseContainerName,
        'pg_isready',
        '--username',
        databaseUser,
        '--dbname',
        databaseName,
      ]);
      return;
    } catch {
      await delay(1000);
    }
  }

  throw new Error('The disposable PostgreSQL database did not become ready.');
}

async function readAppliedMigrationCount() {
  return Number(
    await capture('docker', [
      'exec',
      databaseContainerName,
      'psql',
      '--username',
      databaseUser,
      '--dbname',
      databaseName,
      '--tuples-only',
      '--no-align',
      '--command',
      'SELECT count(*) FROM typeorm_migrations',
    ]),
  );
}

function assertMigrationCount(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${expected} applied migrations after the ${label}; found ${actual}.`,
    );
  }
}

function run(command, args, options = {}) {
  return execute(command, args, { ...options, captureOutput: false });
}

function capture(command, args, options = {}) {
  return execute(command, args, { ...options, captureOutput: true }).then(
    (result) => result.stdout.trim(),
  );
}

function execute(command, args, { cwd, captureOutput }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    if (captureOutput) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const failure = new Error(
        `${command} exited with ${signal ?? `code ${code}`}${stderr ? `: ${stderr.trim()}` : ''}`,
      );
      failure.exitCode = code ?? 1;
      reject(failure);
    });
  });
}

async function cleanup(command, args) {
  try {
    await run(command, args);
  } catch {
    console.error(`Could not clean up temporary Docker resource ${args.at(-1)}.`);
    process.exitCode = 1;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
