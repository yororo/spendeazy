import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_POSTGRES_TEST_DATABASES,
  createPostgresTestEnvironment,
} from '../api/scripts/run-required-postgres-tests.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = resolve(rootDirectory, 'api');
const composeFile = resolve(rootDirectory, 'local-test', 'docker-compose.yml');
const children = new Set();
let projectName;
let composeEnvironment;
let composeStarted = false;

export function parseArguments(args) {
  if (args.length === 1 && args[0] === '--api-postgres') return { mode: 'api-postgres' };
  if (args.length === 1 && args[0] === '--help') return { mode: 'help' };
  throw new Error('Usage: node scripts/local-test-launcher.mjs --api-postgres (or --help)');
}

async function main(args = process.argv.slice(2)) {
  const { mode } = parseArguments(args);
  if (mode === 'help') {
    console.log('Usage: node scripts/local-test-launcher.mjs --api-postgres');
    console.log('Starts a fresh, isolated PostgreSQL service, runs every required API PostgreSQL suite, and removes the service and its volume.');
    return;
  }

  const runId = randomBytes(6).toString('hex');
  const database = `spendeazy_test_${runId}`;
  const suiteDatabases = Object.fromEntries(
    REQUIRED_POSTGRES_TEST_DATABASES
      .filter((name) => name !== 'TEST_FINANCIAL_OWNERSHIP_MIGRATION_DATABASE_URL')
      .map((name, index) => [name, `spt_${runId}_${index}`]),
  );
  const migrationDatabase = `spm_${runId}`;
  const databaseUser = `spendeazy_${runId}`;
  const databasePassword = randomBytes(24).toString('hex');
  const databasePort = await findAvailablePort();
  projectName = `spendeazy-api-test-${runId}`;
  composeEnvironment = {
    ...process.env,
    SPENDEAZY_TEST_DB_NAME: database,
    SPENDEAZY_TEST_DB_USER: databaseUser,
    SPENDEAZY_TEST_DB_PASSWORD: databasePassword,
    SPENDEAZY_TEST_DB_PORT: String(databasePort),
  };

  console.log(`Starting disposable PostgreSQL test service on 127.0.0.1:${databasePort}.`);
  try {
    composeStarted = true;
    await compose(['up', '--detach', '--wait', 'postgres']);
    for (const databaseName of [...Object.values(suiteDatabases), migrationDatabase]) {
      await compose(['exec', '--no-TTY', 'postgres', 'createdb', '--username', databaseUser, databaseName]);
    }

    const testEnvironment = createPostgresTestEnvironment({
      host: '127.0.0.1',
      port: databasePort,
      user: databaseUser,
      password: databasePassword,
      databases: suiteDatabases,
      migrationDatabase,
    });
    console.log('Running all required API HTTP and PostgreSQL integration suites.');
    await run(process.execPath, [resolve(apiDirectory, 'scripts/run-required-postgres-tests.mjs')], {
      cwd: apiDirectory,
      env: { ...process.env, ...testEnvironment },
    });
  } finally {
    await stopCompose();
  }
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate a local PostgreSQL port.');
  }
  const { port } = address;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

function compose(args) {
  return run('docker', ['compose', '--project-name', projectName, '--file', composeFile, ...args], {
    cwd: rootDirectory,
    env: composeEnvironment,
  });
}

async function stopCompose() {
  if (!composeStarted) return;
  composeStarted = false;
  try {
    await compose(['down', '--volumes', '--remove-orphans']);
  } catch (error) {
    console.error(`Could not remove disposable PostgreSQL resources: ${error.message}`);
    process.exitCode = process.exitCode || 1;
  }
}

function run(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    children.add(child);
    child.once('error', (error) => {
      children.delete(child);
      rejectRun(error);
    });
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args[0]} exited with ${signal ?? code ?? 'unknown status'}.`));
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    for (const child of children) child.kill(signal);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = process.exitCode || 1;
  });
}
