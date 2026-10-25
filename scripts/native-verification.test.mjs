import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer, Socket } from 'node:net';
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
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
  assert.match(help.stdout, /launch/);
  assert.match(help.stdout, /reload/);
  assert.match(help.stdout, /journey/);
  assert.match(help.stdout, /resume/);
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

test('launch reports a missing Android tool without retrying', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-host-'));
  const sdk = await mkdtemp(join(tmpdir(), 'spendeazy-nv-sdk-'));
  try {
    const result = await runCli(['launch'], {
      ...process.env,
      SPENDEAZY_NATIVE_VERIFICATION_STATE: stateDir,
      SPENDEAZY_NV_ANDROID_SDK: sdk,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      SPENDEAZY_NV_ADB: join(sdk, 'missing-adb'),
    });
    const body = parseJson(result);
    assert.equal(result.code, 1);
    assert.equal(body.ok, false);
    assert.equal(body.outcome, 'blocked');
    assert.equal(body.code, 'host-capability');
    assert.equal(body.authenticatedJourneyCertified, false);
    assert.match(body.message, /adb/);
    assert.match(body.statement, /does not certify an authenticated journey/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    await rm(sdk, { recursive: true, force: true });
  }
});

test('launch rejects a production publishable key before starting Metro', async () => {
  const tools = await writeLaunchTools();
  const stateDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-live-'));
  try {
    const encoded = Buffer.from('example.clerk.accounts.dev$').toString('base64url');
    const result = await runCli(['launch', '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_live_${encoded}`,
    }));
    const body = parseJson(result);
    assert.equal(result.code, 1);
    assert.equal(body.outcome, 'blocked');
    assert.equal(body.code, 'incompatible-public-config');
    assert.equal(body.authenticatedJourneyCertified, false);
    assert.equal(await readFile(tools.expoLog, 'utf8').catch(() => ''), '');
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    await rm(tools.directory, { recursive: true, force: true });
  }
});

test('launch readiness checks and an owned Metro launch', { timeout: 120_000 }, async () => {
  const tools = await writeLaunchTools();
  const stateDir = await mkdtemp(join(tmpdir(), 'spendeazy-nv-launch-'));
  const root = await realpath(repoRoot);
  const packageName = JSON.parse(await readFile(join(repoRoot, 'mobile-app', 'app.json'), 'utf8')).expo.android.package;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const clerkSecret = `sk_test_fictional_launch_${randomBytes(8).toString('hex')}`;
  const api = await listenJson({ status: 'ok', database: 'ready' });
  const matchingJwks = await listenJson({ keys: [publicJwk(publicKey)] });
  const mismatchedJwks = await listenJson({ keys: [publicJwk(otherKey)] });
  const publishableKey = publishableFor(`127.0.0.1:${matchingJwks.port}`);
  const mismatchedKey = publishableFor(`127.0.0.1:${mismatchedJwks.port}`);
  const envMarker = 'http://env-file-must-not-launch.invalid';
  const envLocal = join(repoRoot, 'mobile-app', '.env.local');
  const envLocalOriginal = await readIfExists(envLocal);
  const apiEnvOriginal = await readIfExists(apiEnvPath);
  const decoy = createHttpServer((request, response) => {
    response.end('decoy-still-here');
  });
  decoy.unref();
  await new Promise((resolveListen) => decoy.listen(0, '127.0.0.1', resolveListen));
  const decoyPort = decoy.address().port;
  const heldProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  heldProcess.unref();
  const runId = 'nv-abcdefabcdef';
  const token = 'd'.repeat(32);
  const databaseId = `db${randomBytes(4).toString('hex')}`;
  const apiId = `api${randomBytes(4).toString('hex')}`;
  const known = new Set([clerkSecret, pem, pem.replaceAll('\n', '\\n'), createHash('sha256').update(clerkSecret).digest('hex')]);
  try {
    await writeFile(envLocal, `EXPO_PUBLIC_API_BASE_URL=${envMarker}\nEXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${publishableKey}\n`);
    const missingKey = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({}));
    assert.equal(parseJson(missingKey).code, 'missing-configuration');
    assert.equal(parseJson(missingKey).outcome, 'blocked');
    assert.equal(await readFile(envLocal, 'utf8'), `EXPO_PUBLIC_API_BASE_URL=${envMarker}\nEXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${publishableKey}\n`);
    assert.doesNotMatch(missingKey.stdout, new RegExp(envMarker.replaceAll('.', '\\.')));

    await writeManifestFixture(stateDir, root, { runId, token, databaseId, apiId, apiPort: api.port });
    await tools.writeScenario({
      runId,
      token,
      apiPort: api.port,
      packageName,
      abi: 'x86_64',
      qemu: '1',
      devices: [{ serial: 'emulator-5554', state: 'device' }],
      installed: true,
      appRunning: true,
      versionName: '1.0.0',
      versionCode: '1',
      primaryCpuAbi: 'x86_64',
      lastUpdateTime: '2026-01-01 00:00:00',
      reachability: 'reverse',
      reversed: false,
      containers: [
        { id: databaseId, role: 'database', alive: true },
        { id: apiId, role: 'api', alive: true },
      ],
      env: [],
    });

    const missingClerk = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(missingClerk).code, 'missing-configuration');
    assert.equal(parseJson(missingClerk).outcome, 'blocked');
    assert.equal(await readFile(tools.expoLog, 'utf8').catch(() => ''), '');

    await tools.updateScenario((scenario) => {
      scenario.env = [`CLERK_SECRET_KEY=${clerkSecret}`, `CLERK_JWT_KEY=${pem.replaceAll('\n', '\\n')}`];
    });
    const mismatched = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: mismatchedKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(mismatched).code, 'incompatible-public-config', parseJson(mismatched).message);
    assert.equal(parseJson(mismatched).outcome, 'blocked');

    await tools.updateScenario((scenario) => {
      scenario.reachability = 'fail';
    });
    const unreachable = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(unreachable).code, 'device-api-unreachable');
    assert.equal(parseJson(unreachable).outcome, 'failed');
    assert.equal(await readFile(tools.expoLog, 'utf8').catch(() => ''), '');

    await tools.updateScenario((scenario) => {
      scenario.reachability = 'reverse';
      scenario.devices = [
        { serial: 'emulator-5554', state: 'unauthorized' },
      ];
    });
    const adbLogBefore = await readFile(tools.adbLog, 'utf8').catch(() => '');
    const unauthorized = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    }));
    const bodyUnauthorized = parseJson(unauthorized);
    assert.equal(bodyUnauthorized.code, 'host-capability');
    assert.match(bodyUnauthorized.message, /USB debugging/);
    const adbLogAfter = await readFile(tools.adbLog, 'utf8');
    const newDeviceLists = adbLogAfter.slice(adbLogBefore.length).trim().split('\n').filter((line) => line.includes('"devices"'));
    assert.equal(newDeviceLists.length, 1);

    const busy = createHttpServer((request, response) => response.end('unrelated-metro'));
    busy.unref();
    await new Promise((resolveListen) => busy.listen(0, '127.0.0.1', resolveListen));
    const busyPort = busy.address().port;
    await tools.updateScenario((scenario) => {
      scenario.devices = [{ serial: 'emulator-5554', state: 'device' }];
      scenario.reachability = 'reverse';
      scenario.reversed = false;
    });
    const conflict = await runCli([
      'launch', '--run', runId, '--state-dir', stateDir, '--metro-port', String(busyPort),
    ], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(conflict).code, 'port-conflict');
    assert.equal(parseJson(conflict).outcome, 'blocked');
    const stillThere = await fetch(`http://127.0.0.1:${busyPort}/`);
    assert.equal(await stillThere.text(), 'unrelated-metro');
    busy.close();

    const metroPicker = createServer();
    await new Promise((resolveListen) => metroPicker.listen(0, '127.0.0.1', resolveListen));
    const metroPort = metroPicker.address().port;
    await new Promise((resolveClose) => metroPicker.close(() => resolveClose()));
    await tools.updateScenario((scenario) => {
      scenario.reversed = false;
      scenario.probes = [];
    });
    const launched = await runCli([
      'launch', '--run', runId, '--state-dir', stateDir, '--metro-port', String(metroPort),
    ], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
      EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: 'fictional-android-client',
    }));
    const launchedBody = parseJson(launched);
    if (launched.code !== 0) {
      throw new Error(`launch failed ${launchedBody.code}: ${launchedBody.message}\n${launched.stderr}`);
    }
    assert.equal(launchedBody.outcome, 'launched');
    assert.equal(launchedBody.authenticatedJourneyCertified, false);
    assert.match(launchedBody.statement, /does not certify an authenticated journey/);
    assert.equal(launchedBody.readiness.configurationObservedInBundle, true);
    assert.equal(launchedBody.readiness.deviceApiReachable, true);
    assert.equal(launchedBody.readiness.clerkInstanceCompatible, true);
    assert.equal(launchedBody.readiness.adbReverse, true);
    assert.equal(launchedBody.extensions.device.serial, 'emulator-5554');
    assert.equal(launchedBody.extensions.device.abi, 'x86_64');
    assert.equal(launchedBody.extensions.nativeBuild.packageName, packageName);
    assert.equal(launchedBody.extensions.nativeBuild.apiImageId, 'sha256:image');
    assert.equal(launchedBody.source.revision.length > 0, true);
    assert.match(launchedBody.readiness.deviceApiUrl, new RegExp(`^http://127\\.0\\.0\\.1:${api.port}$`));
    assert.match(launchedBody.readiness.metro.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
    const expoLog = await readFile(tools.expoLog, 'utf8');
    assert.match(expoLog, new RegExp(`http://127\\.0\\.0\\.1:${api.port}`));
    assert.match(expoLog, /"dotenv":"1"/);
    assert.doesNotMatch(expoLog, /env-file-must-not-launch/);
    assert.doesNotMatch(`${launched.stdout}\n${launched.stderr}`, new RegExp(clerkSecret));
    assert.doesNotMatch(`${launched.stdout}\n${launched.stderr}`, /BEGIN PUBLIC KEY/);
    const manifestText = await readFile(join(stateDir, 'runs', runId, 'manifest.json'), 'utf8');
    assert.doesNotMatch(manifestText, new RegExp(clerkSecret));
    assert.doesNotMatch(manifestText, /BEGIN PUBLIC KEY/);

    await tools.updateScenario((scenario) => {
      scenario.devices = [
        { serial: 'emulator-5554', state: 'device' },
        { serial: 'emulator-5556', state: 'device' },
      ];
    });
    const wrongDevice = await runCli([
      'launch', '--run', runId, '--state-dir', stateDir, '--serial', 'emulator-5556',
    ], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(wrongDevice).code, 'identity-mismatch');
    assert.equal(parseJson(wrongDevice).outcome, 'blocked');

    await tools.updateScenario((scenario) => {
      scenario.devices = [{ serial: 'emulator-5554', state: 'device' }];
      scenario.lastUpdateTime = '2026-02-02 00:00:00';
    });
    const wrongBuild = await runCli(['launch', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
      EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: 'fictional-android-client',
    }));
    assert.equal(parseJson(wrongBuild).code, 'identity-mismatch');
    assert.equal((await readFile(tools.expoLog, 'utf8')).trim().split('\n').filter(Boolean).length, 1);

    const wrongRunId = 'nv-bbbbbbbbbbbb';
    await writeManifestFixture(stateDir, root, {
      runId: wrongRunId,
      token: 'e'.repeat(32),
      databaseId,
      apiId,
      apiPort: api.port,
    });
    const wrongRun = await runCli(['launch', '--run', wrongRunId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: clerkSecret,
      CLERK_JWT_KEY: pem,
    }));
    assert.equal(parseJson(wrongRun).outcome, 'blocked');
    assert.equal(['stale-run', 'ownership-mismatch', 'identity-mismatch'].includes(parseJson(wrongRun).code), true);

    const reloaded = await runCli(['reload', '--run', runId, '--state-dir', stateDir], tools.env({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
      EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: 'fictional-android-client',
    }));
    const reloadedBody = parseJson(reloaded);
    if (reloaded.code !== 0) throw new Error(`reload failed ${reloadedBody.code}: ${reloadedBody.message}`);
    assert.equal(reloadedBody.outcome, 'reloaded');
    assert.equal(reloadedBody.authenticatedJourneyCertified, false);
    assert.match(await readFile(tools.expoLog, 'utf8'), /upgrade/);

    const stopped = await runCli(['stop', '--run', runId, '--state-dir', stateDir], tools.env({}));
    const stoppedBody = parseJson(stopped);
    if (stopped.code !== 0) throw new Error(`stop failed ${stoppedBody.code}: ${stoppedBody.message}\n${stopped.stderr}`);
    assert.equal(stoppedBody.lifecycle, 'stopped');
    assert.equal(heldProcess.exitCode, null);
    assert.equal(await (await fetch(`http://127.0.0.1:${decoyPort}/`)).text(), 'decoy-still-here');
    let metroStopped = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fetch(`http://127.0.0.1:${launchedBody.readiness.metro.port}/status`);
      } catch {
        metroStopped = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.equal(metroStopped, true);
    for (const text of [missingKey.stdout, launched.stdout, reloaded.stdout, stopped.stdout]) {
      assert.doesNotMatch(text, new RegExp(clerkSecret));
    }
    assert.equal(await readFile(apiEnvPath, 'utf8').catch(() => null), apiEnvOriginal);
  } finally {
    if (heldProcess.exitCode === null) heldProcess.kill();
    decoy.close();
    api.server.close();
    matchingJwks.server.close();
    mismatchedJwks.server.close();
    if (envLocalOriginal === null) await rm(envLocal, { force: true });
    else await writeFile(envLocal, envLocalOriginal);
    await rm(stateDir, { recursive: true, force: true });
    await rm(tools.directory, { recursive: true, force: true });
    void privateKey;
  }
});

function publishableFor(frontendApi) {
  return `pk_test_${Buffer.from(`${frontendApi}$`).toString('base64url')}`;
}

function publicJwk(publicKey) {
  return { ...publicKey.export({ format: 'jwk' }), kid: 'launch', use: 'sig', alg: 'RS256' };
}

function listenJson(body) {
  const server = createHttpServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(body));
  });
  server.unref();
  return new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen({ server, port: server.address().port }));
  });
}

async function writeManifestFixture(stateDir, root, { runId, token, databaseId, apiId, apiPort }) {
  const directory = join(stateDir, 'runs', runId);
  await mkdir(directory, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    manager: 'native-verification',
    runId,
    ownershipToken: token,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phase: 'ready',
    source: { root, revision: 'a'.repeat(40), dirty: false, fingerprint: 'b'.repeat(64) },
    runtime: { platform: process.platform, node: process.version, docker: '24.0.0', compose: '2.29.0' },
    ports: { api: apiPort, database: apiPort + 1 },
    resources: {
      composeProject: `spendeazy-nv-${runId.slice(3)}`,
      database: {
        containerId: databaseId,
        volumeName: 'unused-volume',
        networkName: 'unused-network',
        image: 'postgres:16-alpine',
        databaseName: 'nv_test',
        user: 'nv_test',
        pid: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      api: {
        containerId: apiId,
        imageTag: 'spendeazy-nv-test:local',
        imageId: 'sha256:image',
        pid: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    extensions: { device: null, nativeBuild: null, evidence: null },
  };
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeLaunchTools() {
  const directory = await mkdtemp(join(tmpdir(), 'spendeazy-nv-tools-'));
  const sdk = join(directory, 'sdk');
  await mkdir(sdk);
  const java = join(directory, 'java');
  const adb = join(directory, 'adb');
  const docker = join(directory, 'docker');
  const expo = join(directory, 'expo');
  const scenario = join(directory, 'scenario.json');
  const adbLog = join(directory, 'adb.log');
  const expoLog = join(directory, 'expo.log');
  await writeFile(java, '#!/bin/sh\nexit 0\n');
  await writeFile(adb, `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const scenarioPath = process.env.SPENDEAZY_NV_ADB_SCENARIO;
const args = process.argv.slice(2);
appendFileSync(process.env.SPENDEAZY_NV_ADB_LOG, JSON.stringify(args) + '\\n');
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const save = () => writeFileSync(scenarioPath, JSON.stringify(scenario));
const joined = args.join(' ');
if (args[0] === 'version') {
  console.log('Android Debug Bridge version 1.0.41');
  process.exit(0);
}
if (args[0] === 'devices') {
  console.log('List of devices attached');
  for (const device of scenario.devices || []) console.log(device.serial + '\\t' + device.state + ' product:sdk model:sdk device:emu transport_id:1');
  process.exit(0);
}
if (joined.includes('getprop ro.product.cpu.abi')) {
  console.log(scenario.abi || 'x86_64');
  process.exit(0);
}
if (joined.includes('getprop ro.kernel.qemu')) {
  console.log(scenario.qemu || '1');
  process.exit(0);
}
if (joined.includes('dumpsys package')) {
  if (!scenario.installed) {
    console.log('Unable to find package');
    process.exit(0);
  }
  console.log('Package [' + scenario.packageName + ']');
  console.log('versionName=' + scenario.versionName);
  console.log('versionCode=' + scenario.versionCode + ' minSdk=24 targetSdk=36');
  console.log('primaryCpuAbi=' + scenario.primaryCpuAbi);
  console.log('lastUpdateTime=' + scenario.lastUpdateTime);
  process.exit(0);
}
if (joined.includes('pidof')) {
  if (!scenario.appRunning) process.exit(1);
  console.log('4242');
  process.exit(0);
}
if (joined.includes(' nc ')) {
  const match = joined.match(/nc -W 2 -w 5 (\\S+) (\\d+)/);
  const host = match ? match[1] : '';
  const port = match ? match[2] : '';
  scenario.probes = scenario.probes || [];
  scenario.probes.push({ host, port });
  let ok = false;
  if (scenario.reachability === 'direct' && host === '10.0.2.2') ok = true;
  if (scenario.reachability === 'reverse' && host === '127.0.0.1' && scenario.reversed) ok = true;
  scenario.lastProbeOk = ok;
  save();
  process.exit(ok ? 0 : 1);
}
if (args.includes('reverse') && args.includes('--list')) {
  if (scenario.reversed) console.log('host-1 tcp:' + scenario.apiPort + ' tcp:' + scenario.apiPort);
  process.exit(0);
}
if (args.includes('reverse') && args.includes('--remove')) {
  scenario.reversed = false;
  save();
  process.exit(0);
}
if (args.includes('reverse')) {
  scenario.reversed = true;
  save();
  console.log(String(scenario.apiPort));
  process.exit(0);
}
if (args.includes('exec-out')) {
  if (!scenario.lastProbeOk) process.exit(1);
  console.log('HTTP/1.0 200 OK\\r\\n\\r\\n{"status":"ok"}');
  process.exit(0);
}
if (joined.includes('rm -f') || args.includes('rm')) process.exit(0);
console.error('unexpected adb ' + joined);
process.exit(1);
`);
  await writeFile(docker, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const scenarioPath = process.env.SPENDEAZY_NV_DOCKER_SCENARIO;
const args = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const save = () => writeFileSync(scenarioPath, JSON.stringify(scenario));
if (args[0] === 'info') process.exit(0);
if (args[0] === 'version') {
  console.log('24.0.0');
  process.exit(0);
}
if (args[0] === 'compose') {
  console.log('2.29.0');
  process.exit(0);
}
if (args[0] === 'ps') {
  const tokenFilter = args.find((arg) => arg.includes('ownership-token='));
  const token = tokenFilter ? tokenFilter.split('ownership-token=')[1] : '';
  const roleFilter = args.find((arg) => arg.includes('/role='));
  const role = roleFilter ? roleFilter.split('/role=')[1] : '';
  if (token === scenario.token) {
    for (const container of scenario.containers || []) {
      if (container.alive && container.role === role) console.log(container.id);
    }
  }
  process.exit(0);
}
if (args[0] === 'inspect') {
  const format = args[args.indexOf('--format') + 1] || '';
  const id = args.at(-1);
  const container = (scenario.containers || []).find((item) => item.id === id && item.alive);
  if (!container) process.exit(1);
  if (format.includes('Config.Env')) {
    console.log((scenario.env || []).join('\\n'));
    process.exit(0);
  }
  console.log([container.id, 'running', '100', '2026-01-01T00:00:00.000Z', 'sha256:image', 'image:local', '/owned', scenario.runId, scenario.token, container.role].join('|'));
  process.exit(0);
}
if (args[0] === 'rm') {
  const id = args.at(-1);
  for (const container of scenario.containers || []) if (container.id === id) container.alive = false;
  save();
  process.exit(0);
}
process.exit(1);
`);
  await writeFile(expo, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
const args = process.argv.slice(2);
const log = process.env.SPENDEAZY_NV_EXPO_LOG;
appendFileSync(log, JSON.stringify({
  args,
  api: process.env.EXPO_PUBLIC_API_BASE_URL,
  key: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  dotenv: process.env.EXPO_NO_DOTENV,
}) + '\\n');
const port = Number(args[args.indexOf('--port') + 1]);
const server = createServer((request, response) => {
  const url = request.url || '';
  if (url.startsWith('/status')) {
    response.end('packager-status:running');
    return;
  }
  if (url.includes('bundle')) {
    response.end('bundle ' + process.env.EXPO_PUBLIC_API_BASE_URL + ' ' + process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
    return;
  }
  response.statusCode = 404;
  response.end();
});
server.on('upgrade', (request, socket) => {
  appendFileSync(log, 'upgrade\\n');
  const key = request.headers['sec-websocket-key'];
  const accept = createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
});
server.listen(port, '127.0.0.1');
`);
  await Promise.all([java, adb, docker, expo].map((path) => chmod(path, 0o755)));
  await writeFile(scenario, '{}\n');
  const env = (extra) => ({
    ...process.env,
    SPENDEAZY_NV_ANDROID_SDK: sdk,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    SPENDEAZY_NV_JAVA: java,
    SPENDEAZY_NV_ADB: adb,
    SPENDEAZY_NV_DOCKER: docker,
    SPENDEAZY_NV_EXPO: expo,
    SPENDEAZY_NV_ADB_SCENARIO: scenario,
    SPENDEAZY_NV_DOCKER_SCENARIO: scenario,
    SPENDEAZY_NV_ADB_LOG: adbLog,
    SPENDEAZY_NV_EXPO_LOG: expoLog,
    SPENDEAZY_NV_LAUNCH_TIMEOUT_MS: '15000',
    SPENDEAZY_NV_BUNDLE_TIMEOUT_MS: '5000',
    ...extra,
  });
  return {
    directory,
    expoLog,
    adbLog,
    env,
    writeScenario: (value) => writeFile(scenario, JSON.stringify(value)),
    updateScenario: async (mutate) => {
      const current = JSON.parse(await readFile(scenario, 'utf8'));
      mutate(current);
      await writeFile(scenario, JSON.stringify(current));
    },
  };
}

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
