import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer, Socket } from 'node:net';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commandPath = join(repoRoot, 'scripts', 'native-verification.mjs');
const apiEnvPath = join(repoRoot, 'api', '.env');

function run(command, args, { env, cwd } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: cwd ?? repoRoot,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => resolveRun({ code: 127, stdout: '', stderr: error.message }));
    child.once('close', (code) => {
      resolveRun({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

function runCli(args, env) {
  return run(process.execPath, [commandPath, ...args], { env });
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Expected JSON on stdout, received exit ${result.code}.`);
  }
}

test('help and usage stay at the command boundary', async () => {
  const help = await runCli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /start/);
  assert.match(help.stdout, /attach/);
  assert.match(help.stdout, /status/);
  assert.match(help.stdout, /stop/);
  assert.match(help.stdout, /replace-api/);
  assert.match(help.stdout, /Windows/);
  assert.match(help.stdout, /LOCALAPPDATA/);
  assert.doesNotMatch(help.stdout, /sk_test_/);

  const missing = await runCli([]);
  assert.equal(missing.code, 2);
  assert.equal(parseJson(missing).code, 'usage');

  const unknown = await runCli(['dance']);
  assert.equal(unknown.code, 2);

  const both = await runCli(['start', '--new', '--run', 'nv-0123456789ab']);
  assert.equal(both.code, 2);

  const traversal = await runCli(['status', '--run', '../secret']);
  assert.equal(traversal.code, 2);
});

test('a busy selected port is rejected before any owned resources are created', async () => {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  const stateDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-port-'));
  const marker = `still-listening-${randomBytes(4).toString('hex')}`;
  server.once('connection', (socket) => {
    socket.end(marker);
  });
  try {
    const result = await runCli([
      'start',
      '--new',
      '--api-port', String(port),
      '--state-dir', stateDir,
    ], process.env);
    const body = parseJson(result);
    assert.equal(result.code, 1);
    assert.equal(body.code, 'port-conflict');
    assert.equal(body.ok, false);
    const runs = await readdirSafe(join(stateDir, 'runs'));
    assert.deepEqual(runs, []);
    const response = await new Promise((resolveResponse, reject) => {
      const socket = new Socket();
      socket.once('error', reject);
      socket.once('data', (chunk) => resolveResponse(chunk.toString('utf8')));
      socket.connect(port, '127.0.0.1');
    });
    assert.equal(response, marker);
  } finally {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

test('owned environment lifecycle, replacement, and isolated cleanup', { timeout: 25 * 60 * 1000 }, async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-life-'));
  const homeDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-home-'));
  const personalDir = join(homeDir, '.spendeazy');
  await mkdir(personalDir, { recursive: true });
  const personalEnvPath = join(personalDir, 'api.env');
  const personalMarker = 'sk_test_personal_env_marker_182';
  const dotenvMarker = 'sk_test_api_dotenv_marker_182';
  const personalOriginal = `PERSONAL_CLERK_SECRET=${personalMarker}\n`;
  await writeFile(personalEnvPath, personalOriginal);
  const apiEnvOriginal = await readIfExists(apiEnvPath);
  const apiEnvWritten = `${apiEnvOriginal ?? ''}SPENDEAZY_NV_TEST_MARKER=${dotenvMarker}\n`;
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clerkJwtKey = publicKey.export({ type: 'spki', format: 'pem' });
  const clerkSecretKey = `sk_test_fictional_native_verification_${randomBytes(8).toString('hex')}`;
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    LOCALAPPDATA: join(homeDir, 'AppData', 'Local'),
    SPENDEAZY_NATIVE_VERIFICATION_STATE: stateDir,
    CLERK_JWT_KEY: clerkJwtKey,
    CLERK_SECRET_KEY: clerkSecretKey,
  };
  const transcripts = [];
  const encodedJwt = clerkJwtKey.replaceAll('\r\n', '\n').replaceAll('\n', '\\n').replace(/(?:\\n)+$/, '');
  const known = new Set([
    clerkJwtKey,
    clerkJwtKey.replaceAll('\n', '\\n'),
    encodedJwt,
    clerkSecretKey,
    personalMarker,
    dotenvMarker,
    personalOriginal.trim(),
  ]);
  const decoyName = `spendeazy-nv-decoy-${randomBytes(3).toString('hex')}`;
  const decoyVolume = `spendeazy-nv-decoy-vol-${randomBytes(3).toString('hex')}`;
  let heldProcess = null;
  let decoyId = null;
  const runsToStop = new Set();

  function track(result) {
    transcripts.push(`${result.stdout}\n${result.stderr}`);
    assertAbsent('command output', `${result.stdout}\n${result.stderr}`, known);
    return result;
  }

  function requireOk(result) {
    const body = parseJson(result);
    if (result.code !== 0 || body.ok !== true) {
      throw new Error(`Command failed with ${body.code ?? result.code}: ${safeTail(body.message ?? result.stderr, known)}`);
    }
    return body;
  }

  try {
    await writeFile(apiEnvPath, apiEnvWritten);
    const first = requireOk(track(await runCli(['start', '--state-dir', stateDir], env)));
    assert.equal(first.reused, false);
    assert.equal(first.lifecycle, 'running');
    assert.equal(first.compatible, true);
    assert.equal(first.ownershipVerified, true);
    assert.equal(first.extensions.device, null);
    assert.equal(first.extensions.nativeBuild, null);
    assert.equal(first.extensions.evidence, null);
    assert.ok(first.resources.database.containerId);
    assert.ok(first.resources.api.containerId);
    assert.equal(first.runtime.node, process.version);
    runsToStop.add(first.runId);
    await rememberGeneratedSecrets(stateDir, first.runId, known);
    assertAbsent('earlier output', transcripts.join('\n'), known);

    const manifestText = await readFile(join(stateDir, 'runs', first.runId, 'manifest.json'), 'utf8');
    assertAbsent('manifest', manifestText, known);
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.manager, 'native-verification');
    assert.equal(manifest.ownershipToken.length, 32);
    assert.ok(manifest.source.revision);
    assert.ok(manifest.source.fingerprint);
    const secretStat = await stat(join(stateDir, 'runs', first.runId, 'secrets.env'));
    assert.equal(secretStat.mode & 0o777, 0o600);
    assert.equal(await readFile(apiEnvPath, 'utf8'), apiEnvWritten);
    assert.equal(await readFile(personalEnvPath, 'utf8'), personalOriginal);

    const health = await fetch(`http://127.0.0.1:${first.ports.api}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', database: 'ready' });

    const reused = requireOk(track(await runCli(['start', '--state-dir', stateDir], env)));
    assert.equal(reused.reused, true);
    assert.equal(reused.runId, first.runId);
    assert.equal(reused.resources.database.containerId, first.resources.database.containerId);

    const attached = requireOk(track(await runCli(['attach', '--run', first.runId, '--state-dir', stateDir], env)));
    assert.equal(attached.runId, first.runId);
    assert.equal(attached.compatible, true);

    const password = decodeEnv(await readFile(join(stateDir, 'runs', first.runId, 'secrets.env'), 'utf8')).SPENDEAZY_NV_DB_PASSWORD;
    const inserted = await psql(
      first.resources.database.containerId,
      first.resources.database.user,
      first.resources.database.databaseName,
      password,
      "CREATE TABLE native_verification_probe (note text); INSERT INTO native_verification_probe (note) VALUES ('fictional-native-verification-row');",
    );
    assert.equal(inserted.code, 0, safeTail(inserted.stderr, known));

    const incompatibleId = 'nv-111111111111';
    await mkdir(join(stateDir, 'runs', incompatibleId), { recursive: true });
    await writeFile(join(stateDir, 'runs', incompatibleId, 'manifest.json'), JSON.stringify({
      ...manifest,
      runId: incompatibleId,
      ownershipToken: 'a'.repeat(32),
      source: { ...manifest.source, root: '/not/this/checkout' },
      resources: {
        ...manifest.resources,
        database: { ...manifest.resources.database, containerId: first.resources.database.containerId },
        api: { ...manifest.resources.api, containerId: first.resources.api.containerId, pid: process.pid },
      },
    }));
    const incompatible = track(await runCli(['attach', '--run', incompatibleId, '--state-dir', stateDir], env));
    assert.equal(incompatible.code, 1);
    assert.equal(parseJson(incompatible).code, 'incompatible-run');
    assert.equal((await fetch(`http://127.0.0.1:${first.ports.api}/health`)).status, 200);

    const stoppedApi = await run('docker', ['stop', first.resources.api.containerId]);
    assert.equal(stoppedApi.code, 0, safeTail(stoppedApi.stderr, known));
    const duringApiStop = requireOk(track(await runCli(['status', '--run', first.runId, '--state-dir', stateDir], env)));
    assert.equal(duringApiStop.lifecycle, 'api-stopped');
    assert.equal(duringApiStop.resources.database.observed.status, 'running');
    assert.equal(duringApiStop.resources.database.containerId, first.resources.database.containerId);
    assert.equal(duringApiStop.resources.api.observed.identityMatches, true);
    assert.notEqual(duringApiStop.resources.api.observed.status, 'running');
    const retainedWhileApiStopped = await psql(
      first.resources.database.containerId,
      first.resources.database.user,
      first.resources.database.databaseName,
      password,
      'SELECT note FROM native_verification_probe;',
    );
    assert.equal(retainedWhileApiStopped.stdout.trim(), 'fictional-native-verification-row');

    const edited = JSON.parse(await readFile(join(stateDir, 'runs', first.runId, 'manifest.json'), 'utf8'));
    edited.extensions.device = { serial: null };
    await writeFile(join(stateDir, 'runs', first.runId, 'manifest.json'), `${JSON.stringify(edited, null, 2)}\n`);
    const replaced = requireOk(track(await runCli(['replace-api', '--run', first.runId, '--state-dir', stateDir], env)));
    assert.equal(replaced.apiRebuilt, true);
    assert.equal(replaced.databaseContainerId, first.resources.database.containerId);
    assert.notEqual(replaced.resources.api.containerId, first.resources.api.containerId);
    assert.equal(replaced.resources.database.containerId, first.resources.database.containerId);
    assert.equal(replaced.lifecycle, 'running');
    assert.deepEqual(replaced.extensions.device, { serial: null });
    assert.equal(replaced.extensions.nativeBuild, null);
    assert.equal(replaced.extensions.evidence, null);
    const replacedHealth = await fetch(`http://127.0.0.1:${replaced.ports.api}/health`);
    assert.equal(replacedHealth.status, 200);
    const retained = await psql(
      replaced.resources.database.containerId,
      replaced.resources.database.user,
      replaced.resources.database.databaseName,
      password,
      'SELECT note FROM native_verification_probe;',
    );
    assert.equal(retained.stdout.trim(), 'fictional-native-verification-row');

    const second = requireOk(track(await runCli(['start', '--new', '--state-dir', stateDir], env)));
    assert.notEqual(second.runId, first.runId);
    runsToStop.add(second.runId);
    await rememberGeneratedSecrets(stateDir, second.runId, known);
    const secondPassword = decodeEnv(await readFile(join(stateDir, 'runs', second.runId, 'secrets.env'), 'utf8')).SPENDEAZY_NV_DB_PASSWORD;
    const secondInsert = await psql(
      second.resources.database.containerId,
      second.resources.database.user,
      second.resources.database.databaseName,
      secondPassword,
      "CREATE TABLE native_verification_probe (note text); INSERT INTO native_verification_probe (note) VALUES ('fictional-second-run-row');",
    );
    assert.equal(secondInsert.code, 0, safeTail(secondInsert.stderr, known));

    const decoy = await run('docker', [
      'run', '-d', '--name', decoyName,
      '--label', 'io.spendeazy.native-verification/run-id=nv-000000000000',
      '--label', 'io.spendeazy.native-verification/ownership-token=not-owned',
      '--label', 'io.spendeazy.native-verification/role=api',
      '--entrypoint', 'sleep', 'postgres:16-alpine', '600',
    ]);
    assert.equal(decoy.code, 0, safeTail(decoy.stderr, known));
    decoyId = decoy.stdout.trim();
    const volume = await run('docker', [
      'volume', 'create',
      '--label', 'io.spendeazy.native-verification/run-id=nv-000000000000',
      '--label', 'io.spendeazy.native-verification/ownership-token=not-owned',
      '--label', 'io.spendeazy.native-verification/role=database',
      decoyVolume,
    ]);
    assert.equal(volume.code, 0, safeTail(volume.stderr, known));
    heldProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    const fakeId = 'nv-222222222222';
    const secondManifest = JSON.parse(await readFile(join(stateDir, 'runs', second.runId, 'manifest.json'), 'utf8'));
    await mkdir(join(stateDir, 'runs', fakeId), { recursive: true });
    await writeFile(join(stateDir, 'runs', fakeId, 'manifest.json'), JSON.stringify({
      ...secondManifest,
      runId: fakeId,
      ownershipToken: 'b'.repeat(32),
      source: { ...secondManifest.source, root: '/not/this/checkout' },
      resources: {
        ...secondManifest.resources,
        composeProject: secondManifest.resources.composeProject,
        database: {
          ...secondManifest.resources.database,
          containerId: second.resources.database.containerId,
          pid: heldProcess.pid,
        },
        api: {
          ...secondManifest.resources.api,
          containerId: decoyId,
          pid: heldProcess.pid,
        },
      },
    }));
    const fakeStop = requireOk(track(await runCli(['stop', '--run', fakeId, '--state-dir', stateDir], env)));
    assert.equal(fakeStop.lifecycle, 'stopped');
    assert.ok(fakeStop.skipped.some((entry) => entry.id === decoyId && entry.reason === 'not-owned'));
    assert.ok(fakeStop.skipped.some((entry) => entry.id === secondManifest.resources.database.volumeName && entry.reason === 'not-owned'));
    assert.equal(heldProcess.exitCode, null);
    assert.equal((await run('docker', ['inspect', '-f', '{{.State.Running}}', decoyId])).stdout.trim(), 'true');
    assert.equal((await run('docker', ['volume', 'inspect', decoyVolume])).code, 0);
    const secondStillThere = await psql(
      second.resources.database.containerId,
      second.resources.database.user,
      second.resources.database.databaseName,
      secondPassword,
      'SELECT note FROM native_verification_probe;',
    );
    assert.equal(secondStillThere.stdout.trim(), 'fictional-second-run-row');
    assert.equal((await fetch(`http://127.0.0.1:${second.ports.api}/health`)).status, 200);
    const secondImage = await run('docker', ['image', 'inspect', second.resources.api.imageTag]);
    assert.equal(secondImage.code, 0);

    const stoppedFirst = requireOk(track(await runCli(['stop', '--run', first.runId, '--state-dir', stateDir], env)));
    assert.equal(stoppedFirst.lifecycle, 'stopped');
    runsToStop.delete(first.runId);
    assert.equal(await run('docker', ['inspect', first.resources.database.containerId]).then((result) => result.code), 1);
    assert.equal((await fetch(`http://127.0.0.1:${second.ports.api}/health`)).status, 200);
    assert.equal((await run('docker', ['inspect', '-f', '{{.State.Running}}', decoyId])).stdout.trim(), 'true');
    assert.equal(heldProcess.exitCode, null);

    await run('docker', ['rm', '--force', second.resources.api.containerId, second.resources.database.containerId]);
    const stale = requireOk(track(await runCli(['status', '--run', second.runId, '--state-dir', stateDir], env)));
    assert.equal(stale.lifecycle, 'stale');
    assert.equal(stale.ownershipVerified, false);
    assert.equal(stale.resources.database.observed.identityMatches, false);
    const staleAttach = track(await runCli(['attach', '--run', second.runId, '--state-dir', stateDir], env));
    assert.equal(staleAttach.code, 1);
    assert.equal(parseJson(staleAttach).code, 'stale-run');

    const third = requireOk(track(await runCli(['start', '--state-dir', stateDir], env)));
    assert.notEqual(third.runId, second.runId);
    runsToStop.add(third.runId);
    await rememberGeneratedSecrets(stateDir, third.runId, known);
    const thirdProbe = await psql(
      third.resources.database.containerId,
      third.resources.database.user,
      third.resources.database.databaseName,
      decodeEnv(await readFile(join(stateDir, 'runs', third.runId, 'secrets.env'), 'utf8')).SPENDEAZY_NV_DB_PASSWORD,
      'SELECT note FROM native_verification_probe;',
    );
    assert.notEqual(thirdProbe.code, 0);
    const recovered = requireOk(track(await runCli(['stop', '--run', second.runId, '--state-dir', stateDir], env)));
    assert.equal(recovered.lifecycle, 'stopped');
    runsToStop.delete(second.runId);
    assert.notEqual((await run('docker', ['volume', 'inspect', secondManifest.resources.database.volumeName])).code, 0);
    assert.equal((await fetch(`http://127.0.0.1:${third.ports.api}/health`)).status, 200);
    assert.equal((await run('docker', ['inspect', '-f', '{{.State.Running}}', decoyId])).stdout.trim(), 'true');
    assert.equal((await run('docker', ['volume', 'inspect', decoyVolume])).code, 0);
    assert.equal(heldProcess.exitCode, null);

    for (const text of transcripts) assertAbsent('transcript', text, known);
    assert.equal(await readFile(apiEnvPath, 'utf8'), apiEnvWritten);
    assert.equal(await readFile(personalEnvPath, 'utf8'), personalOriginal);
  } finally {
    await writeArtifact(transcripts, [...runsToStop]);
    if (heldProcess && heldProcess.exitCode === null) heldProcess.kill();
    try {
      const { readdir } = await import('node:fs/promises');
      for (const runId of await readdir(join(stateDir, 'runs'))) {
        await runCli(['stop', '--run', runId, '--state-dir', stateDir], env);
      }
    } catch {
      // The state directory is already gone or was never created.
    }
    if (decoyId) await run('docker', ['rm', '--force', decoyId]);
    await run('docker', ['volume', 'rm', '--force', decoyVolume]);
    await rm(stateDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    if (apiEnvOriginal === null) await rm(apiEnvPath, { force: true });
    else await writeFile(apiEnvPath, apiEnvOriginal);
  }
});

async function rememberGeneratedSecrets(stateDir, runId, known) {
  const values = decodeEnv(await readFile(join(stateDir, 'runs', runId, 'secrets.env'), 'utf8'));
  for (const value of Object.values(values)) {
    if (!value || value.length < 8) continue;
    known.add(value);
    known.add(value.replaceAll('\n', '\\n'));
    known.add(createHash('sha256').update(value).digest('hex'));
    known.add(createHash('sha256').update(value).digest('base64'));
  }
}

function assertAbsent(label, haystack, secrets) {
  for (const secret of secrets) {
    if (secret && haystack.includes(secret)) {
      throw new Error(`${label} exposed a credential or secret hash.`);
    }
  }
}

function safeTail(text, secrets) {
  let output = text.slice(-1500);
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[redacted]');
  }
  return output;
}

function decodeEnv(text) {
  const values = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1).replaceAll('\\n', '\n');
  }
  return values;
}

async function psql(containerId, user, database, password, sql) {
  return run('docker', [
    'exec', '-e', 'PGPASSWORD', '-i', containerId,
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-t', '-A', '-c', sql,
  ], { env: { ...process.env, PGPASSWORD: password } });
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readdirSafe(path) {
  try {
    const { readdir } = await import('node:fs/promises');
    return await readdir(path);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeArtifact(transcripts, runIds) {
  const directory = '/opt/cursor/artifacts';
  await mkdir(directory, { recursive: true });
  const lines = [
    'Native verification lifecycle transcripts with credentials removed by the test harness.',
    `Runs: ${runIds.join(', ')}`,
    '',
  ];
  lines.push(...transcripts);
  await writeFile(join(directory, 'native-verification-lifecycle.log'), lines.join('\n'));
}
