import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { configurationFingerprint, installedFingerprint } from './native-verification-launch.mjs';
import { sourceIdentity } from './native-verification.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commandPath = join(repoRoot, 'scripts', 'native-verification.mjs');
const packageName = JSON.parse(await readFile(join(repoRoot, 'mobile-app', 'app.json'), 'utf8')).expo.android.package;

function run(command, args, { env } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
    throw new Error(`Expected JSON on stdout, received exit ${result.code}: ${result.stderr}`);
  }
}

function freePort() {
  const server = createServer();
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

test('journey selection is rejected outside journey and resume', async () => {
  const misplaced = await runCli(['start', '--journey', 'sign-in-visible']);
  assert.equal(misplaced.code, 2);
  assert.equal(parseJson(misplaced).code, 'usage');
  const missing = await runCli(['journey', '--state-dir', tmpdir()]);
  assert.equal(missing.code, 2);
  assert.equal(parseJson(missing).code, 'usage');
});

test('screen selectors stay in journey definitions', async () => {
  const engine = await readFile(join(repoRoot, 'scripts', 'native-verification-journey.mjs'), 'utf8');
  const launch = await readFile(join(repoRoot, 'scripts', 'native-verification-launch.mjs'), 'utf8');
  const definition = await readFile(join(repoRoot, 'scripts', 'native-journeys', 'sign-in-visible.mjs'), 'utf8');
  assert.equal(engine.includes('Sign in with Google'), false);
  assert.equal(launch.includes('Sign in with Google'), false);
  assert.match(definition, /Sign in with Google/);
  assert.match(definition, /Spendeazy/);
});

test('journey reports, resume, and sanitization stay at the command boundary', async () => {
  const engineBefore = createHash('sha256').update(await readFile(join(repoRoot, 'scripts', 'native-verification-journey.mjs'))).digest('hex');
  const directory = await mkdtemp(join(tmpdir(), 'spendeazy-nv-journey-'));
  const stateDir = join(directory, 'state');
  const journeyDir = join(directory, 'journeys');
  const sdk = join(directory, 'sdk');
  await mkdir(sdk);
  const adb = join(directory, 'adb');
  const docker = join(directory, 'docker');
  const scenarioPath = join(directory, 'scenario.json');
  const runId = 'nv-abc123abc123';
  const token = 'e'.repeat(32);
  const marker = `sk_test_fictionaljourney${createHash('sha256').update(runId).digest('hex').slice(0, 12)}`;
  const markerHash = createHash('sha256').update(marker).digest('hex');
  const source = await sourceIdentity({ repoRoot, processEnv: process.env, secrets: new Set() });
  const publishableKey = `pk_test_${Buffer.from('example.clerk.accounts.dev$').toString('base64url')}`;
  const apiPort = 3010;
  const apiUrl = `http://10.0.2.2:${apiPort}`;
  const installed = {
    packageName,
    versionName: '1.0.0',
    versionCode: '1',
    primaryCpuAbi: 'x86_64',
    lastUpdateTime: '2026-01-01 00:00:00',
  };
  const configFingerprint = configurationFingerprint({
    packageName,
    abi: 'x86_64',
    apiBaseUrl: apiUrl,
    publishableKey,
    androidClientId: '',
  });
  const buildFingerprint = installedFingerprint(configFingerprint, installed);
  const metroPort = await freePort();
  const uiXml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="Spendeazy" content-desc="" resource-id="" password="false" bounds="[10,20][110,70]" />
  <node text="Sign in with Google" content-desc="Sign in with Google" resource-id="" password="false" bounds="[10,90][210,150]" />
  <node text="${marker}" content-desc="${markerHash}" resource-id="" password="false" bounds="[0,0][1,1]" />
  <node text="bank-password-fictional" content-desc="" resource-id="" password="true" bounds="[0,0][2,2]" />
</hierarchy>`;
  await writeFile(adb, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const scenarioPath = process.env.SPENDEAZY_NV_ADB_SCENARIO;
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const save = () => writeFileSync(scenarioPath, JSON.stringify(scenario));
const args = process.argv.slice(2);
const joined = args.join(' ');
if (args[0] === 'version') {
  console.log('Android Debug Bridge version 1.0.41');
  process.exit(0);
}
if (args[0] === 'devices') {
  console.log('List of devices attached');
  console.log('emulator-5554\\tdevice product:sdk model:sdk device:emu transport_id:1');
  process.exit(0);
}
if (joined.includes('getprop ro.product.cpu.abi')) {
  console.log('x86_64');
  process.exit(0);
}
if (joined.includes('dumpsys package')) {
  console.log('Package [' + scenario.packageName + ']');
  console.log('versionName=' + scenario.versionName);
  console.log('versionCode=' + scenario.versionCode + ' minSdk=24 targetSdk=36');
  console.log('primaryCpuAbi=' + scenario.primaryCpuAbi);
  console.log('lastUpdateTime=' + scenario.lastUpdateTime);
  process.exit(0);
}
if (joined.includes('pidof')) {
  console.log('4242');
  process.exit(0);
}
if (joined.includes('uiautomator')) {
  scenario.dumps = (scenario.dumps || 0) + 1;
  scenario.dumpPath = args.at(-1);
  save();
  console.log('UI hierchary dumped to: ' + scenario.dumpPath);
  process.exit(0);
}
if (args.includes('exec-out')) {
  console.log(scenario.uiXml);
  process.exit(0);
}
if (joined.includes('logcat')) {
  console.log('ReactNativeJS: screen ready ${marker}');
  process.exit(0);
}
if (joined.includes('input tap')) {
  scenario.taps = scenario.taps || [];
  scenario.taps.push(args.slice(-2).join(','));
  save();
  process.exit(0);
}
if (args.includes('rm')) process.exit(0);
console.error('unexpected adb ' + joined);
process.exit(1);
`);
  await writeFile(docker, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const scenario = JSON.parse(readFileSync(process.env.SPENDEAZY_NV_ADB_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
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
    for (const container of scenario.containers) {
      if (container.role === role) console.log(container.id);
    }
  }
  process.exit(0);
}
if (args[0] === 'inspect') {
  const id = args.at(-1);
  const container = scenario.containers.find((item) => item.id === id);
  if (!container) process.exit(1);
  console.log([container.id, 'running', '100', '2026-01-01T00:00:00.000Z', 'sha256:image', 'image:local', '/owned', scenario.runId, scenario.token, container.role].join('|'));
  process.exit(0);
}
if (args[0] === 'logs') {
  console.log('api ready ${marker}');
  process.exit(0);
}
if (args[0] === 'volume' || args[0] === 'network') process.exit(1);
console.error('unexpected docker ' + args.join(' '));
process.exit(1);
`);
  await Promise.all([adb, docker].map((path) => chmod(path, 0o755)));
  const scenario = {
    runId,
    token,
    packageName,
    versionName: installed.versionName,
    versionCode: installed.versionCode,
    primaryCpuAbi: installed.primaryCpuAbi,
    lastUpdateTime: installed.lastUpdateTime,
    uiXml,
    dumps: 0,
    taps: [],
    containers: [
      { id: 'db1234567890', role: 'database' },
      { id: 'api1234567890', role: 'api' },
    ],
  };
  await writeFile(scenarioPath, JSON.stringify(scenario));
  const launcher = join(stateDir, 'runs', runId, 'metro-launcher.mjs');
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(launcher, `import { createServer } from 'node:http';
const port = Number(process.argv[2]);
createServer((request, response) => {
  response.end('packager-status:running');
}).listen(port, '127.0.0.1');
`);
  await writeFile(join(stateDir, 'runs', runId, 'launch.log'), `Metro bundled\n${marker}\n`);
  const manifest = {
    schemaVersion: 1,
    manager: 'native-verification',
    runId,
    ownershipToken: token,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phase: 'ready',
    source: {
      root: source.root,
      revision: source.revision,
      dirty: source.dirty,
      fingerprint: source.fingerprint,
    },
    runtime: { platform: process.platform, node: process.version, docker: '24.0.0', compose: '2.29.0' },
    ports: { api: apiPort, database: apiPort + 1 },
    resources: {
      composeProject: 'spendeazy-nv-abc123abc123',
      database: {
        containerId: 'db1234567890',
        volumeName: 'unused-volume',
        networkName: 'unused-network',
        image: 'postgres:16-alpine',
        databaseName: 'nv_test',
        user: 'nv_test',
        pid: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      api: {
        containerId: 'api1234567890',
        imageTag: 'spendeazy-nv-test:local',
        imageId: 'sha256:image',
        pid: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    extensions: { device: null, nativeBuild: null, evidence: { journey: { outcome: 'passed', runId: 'nv-ffffffffffffffff', sourceFingerprint: 'a'.repeat(64) } } },
  };
  await writeFile(join(stateDir, 'runs', runId, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(journeyDir);
  const env = {
    ...process.env,
    SPENDEAZY_NV_ANDROID_SDK: sdk,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    SPENDEAZY_NV_ADB: adb,
    SPENDEAZY_NV_DOCKER: docker,
    SPENDEAZY_NV_ADB_SCENARIO: scenarioPath,
    SPENDEAZY_NV_JOURNEY_DIR: journeyDir,
    SPENDEAZY_NV_JOURNEY_POLL_MS: '40',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    CLERK_SECRET_KEY: marker,
  };
  const child = spawn(process.execPath, [launcher, String(metroPort)], { stdio: 'ignore' });
  const transcripts = [];
  const invoke = async (args) => {
    const result = await runCli(args, env);
    transcripts.push(result.stdout);
    return result;
  };
  try {
    const readyDeadline = Date.now() + 5_000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${metroPort}/status`);
        if ((await response.text()).includes('packager-status:running')) {
          ready = true;
          break;
        }
      } catch {
        // Metro is still opening its port.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.equal(ready, true);

    await writeFile(join(journeyDir, 'fixture-screen.mjs'), `export default {
  id: 'fixture-screen',
  summary: 'Fixture that looks for a control this screen does not have.',
  steps: [{ id: 'missing', action: 'see', selector: { text: 'Missing journey control' }, timeoutMs: 200 }],
};
`);
    const blocked = parseJson(await invoke(['journey', '--journey', 'fixture-screen', '--run', runId, '--state-dir', stateDir]));
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.code, 'launch-required');
    assert.equal(blocked.certified, false);
    assert.equal(blocked.authenticatedJourneyCertified, false);

    manifest.extensions = {
      device: { serial: 'emulator-5554', abi: 'x86_64', apiUrl, emulator: true },
      nativeBuild: {
        packageName,
        abi: 'x86_64',
        fingerprint: buildFingerprint,
        configurationFingerprint: configFingerprint,
        sourceFingerprint: source.fingerprint,
        apiImageId: 'sha256:image',
        metro: { port: metroPort, endpoint: `http://127.0.0.1:${metroPort}`, launcherPid: child.pid },
      },
      evidence: { journey: { outcome: 'passed', runId: 'nv-ffffffffffffffff', sourceFingerprint: 'a'.repeat(64) } },
    };
    await writeFile(join(stateDir, 'runs', runId, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const absent = parseJson(await invoke(['journey', '--journey', 'not-a-journey', '--run', runId, '--state-dir', stateDir]));
    assert.equal(absent.code, 'journey-not-found');
    assert.equal(absent.outcome, 'blocked');
    assert.equal(absent.certified, false);

    await writeFile(join(journeyDir, 'retired-screen.mjs'), `export default {
  id: 'retired-screen',
  retired: { reason: 'This fixture screen was removed on purpose.' },
};
`);
    const dumpsBefore = JSON.parse(await readFile(scenarioPath, 'utf8')).dumps;
    const retired = await invoke(['journey', '--journey', 'retired-screen', '--run', runId, '--state-dir', stateDir]);
    const retiredBody = parseJson(retired);
    assert.equal(retired.code, 1);
    assert.equal(retiredBody.outcome, 'skipped');
    assert.equal(retiredBody.certified, false);
    assert.match(retiredBody.journey.reason, /removed on purpose/);
    assert.equal(JSON.parse(await readFile(scenarioPath, 'utf8')).dumps, dumpsBefore);

    await writeFile(join(journeyDir, 'broken-screen.mjs'), 'export default { id: "other-id", steps: [] };\n');
    const broken = parseJson(await invoke(['journey', '--journey', 'broken-screen', '--run', runId, '--state-dir', stateDir]));
    assert.equal(broken.code, 'invalid-journey');
    assert.equal(broken.outcome, 'blocked');
    assert.equal(broken.certified, false);

    const started = Date.now();
    const failed = await invoke(['journey', '--journey', 'fixture-screen', '--run', runId, '--state-dir', stateDir]);
    const failedBody = parseJson(failed);
    assert.ok(Date.now() - started < 5_000, 'missing selector timed out inside the bound');
    assert.equal(failed.code, 1);
    assert.equal(failedBody.ok, false);
    assert.equal(failedBody.outcome, 'failed');
    assert.equal(failedBody.certified, false);
    assert.equal(failedBody.authenticatedJourneyCertified, false);
    assert.notEqual(failedBody.journey.identity.sourceFingerprint, 'a'.repeat(64));
    assert.equal(failedBody.journey.identity.runId, runId);
    assert.equal(failedBody.journey.identity.serial, 'emulator-5554');
    assert.equal(failedBody.journey.identity.nativeBuildFingerprint, buildFingerprint);
    assert.equal(failedBody.extensions.evidence.journey.outcome, 'failed');
    assert.equal(failedBody.extensions.evidence.journey.matchesCurrentSource, true);
    assert.notEqual(failedBody.extensions.evidence.journey.sourceFingerprint, 'a'.repeat(64));
    assert.equal(failedBody.journey.claims.softwareChecks.outcome, 'not-run');
    assert.equal(failedBody.journey.claims.softwareChecks.certifies, false);
    assert.equal(failedBody.journey.claims.buildInstallation.outcome, 'recorded');
    assert.equal(failedBody.journey.claims.buildInstallation.certifies, false);
    assert.equal(failedBody.journey.claims.uiAssertions.outcome, 'failed');
    assert.equal(failedBody.journey.claims.uiAssertions.certifies, false);
    assert.equal(failedBody.journey.assertions[0].outcome, 'failed');
    assert.match(failedBody.journey.assertions[0].reason, /Missing journey control/);
    assert.match(failedBody.journey.assertions[0].reason, /timeout/);
    const captureIndex = failedBody.evidence.find((item) => item.kind === 'index');
    assert.equal(captureIndex.runId, runId);
    const index = JSON.parse(await readFile(join(stateDir, 'runs', runId, captureIndex.ref), 'utf8'));
    assert.equal(index.runId, runId);
    assert.equal(index.attemptId, failedBody.journey.attemptId);

    await writeFile(join(journeyDir, 'fixture-screen.mjs'), `export default {
  id: 'fixture-screen',
  summary: 'Repaired fixture for the visible screen.',
  steps: [
    { id: 'title', action: 'see', selector: { text: 'Spendeazy' }, timeoutMs: 1000 },
    { id: 'button', action: 'tap', selector: { description: 'Sign in with Google' }, timeoutMs: 1000 },
    { id: 'metro', action: 'log', source: 'metro', includes: 'Metro bundled', timeoutMs: 1000 },
  ],
};
`);
    const passed = await invoke(['journey', '--journey', 'fixture-screen', '--run', runId, '--state-dir', stateDir]);
    const passedBody = parseJson(passed);
    assert.equal(passed.code, 0, passed.stderr);
    assert.equal(passedBody.ok, true);
    assert.equal(passedBody.outcome, 'passed');
    assert.equal(passedBody.certified, true);
    assert.equal(passedBody.authenticatedJourneyCertified, false);
    assert.equal(passedBody.journey.claims.uiAssertions.certifies, true);
    assert.equal(passedBody.journey.claims.buildInstallation.certifies, false);
    assert.deepEqual(passedBody.journey.assertions.map((item) => item.outcome), ['passed', 'passed', 'passed']);
    assert.equal(JSON.parse(await readFile(scenarioPath, 'utf8')).taps.length, 1);
    assert.equal(createHash('sha256').update(await readFile(join(repoRoot, 'scripts', 'native-verification-journey.mjs'))).digest('hex'), engineBefore);

    await writeFile(join(journeyDir, 'optional-gap.mjs'), `export default {
  id: 'optional-gap',
  summary: 'A required control is present and an optional one is not.',
  steps: [
    { id: 'title', action: 'see', selector: { text: 'Spendeazy' }, timeoutMs: 1000 },
    { id: 'missing', action: 'see', selector: { text: 'Missing journey control' }, timeoutMs: 200, required: false },
  ],
};
`);
    const optional = parseJson(await invoke(['journey', '--journey', 'optional-gap', '--run', runId, '--state-dir', stateDir]));
    assert.equal(optional.outcome, 'passed');
    assert.equal(optional.certified, true);
    assert.equal(optional.journey.assertions.find((item) => item.id === 'missing').outcome, 'skipped');
    assert.equal(optional.journey.assertions.find((item) => item.id === 'missing').certifies, false);

    await writeFile(join(journeyDir, 'human-gate.mjs'), `export default {
  id: 'human-gate',
  summary: 'Stop for a person, then check the sign-in control.',
  steps: [
    { id: 'title', action: 'see', selector: { text: 'Spendeazy' }, timeoutMs: 1000 },
    { id: 'person', action: 'checkpoint', reason: 'A person confirms the visible screen.' },
    { id: 'button', action: 'see', selector: { description: 'Sign in with Google' }, timeoutMs: 1000 },
  ],
};
`);
    const pending = await invoke(['journey', '--journey', 'human-gate', '--run', runId, '--state-dir', stateDir]);
    const pendingBody = parseJson(pending);
    assert.equal(pending.code, 1);
    assert.equal(pendingBody.outcome, 'human-pending');
    assert.equal(pendingBody.certified, false);
    assert.equal(pendingBody.journey.assertions.find((item) => item.id === 'button').outcome, 'not-run');
    const checkpointFile = join(stateDir, 'runs', runId, 'journey-checkpoint.json');
    const checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
    checkpoint.identity.configurationFingerprint = 'f'.repeat(64);
    await writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
    const incompatible = await invoke(['resume', '--journey', 'human-gate', '--run', runId, '--state-dir', stateDir]);
    const incompatibleBody = parseJson(incompatible);
    assert.equal(incompatible.code, 1);
    assert.equal(incompatibleBody.code, 'incompatible-resume');
    assert.equal(incompatibleBody.outcome, 'blocked');
    assert.equal(incompatibleBody.certified, false);
    checkpoint.identity.configurationFingerprint = configFingerprint;
    await writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
    const resumed = await invoke(['resume', '--journey', 'human-gate', '--run', runId, '--state-dir', stateDir]);
    const resumedBody = parseJson(resumed);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(resumedBody.outcome, 'passed');
    assert.equal(resumedBody.certified, true);
    assert.equal(resumedBody.journey.assertions.some((item) => item.outcome === 'human-pending'), false);
    assert.equal(resumedBody.journey.assertions.find((item) => item.id === 'button').outcome, 'passed');

    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('other.clerk.accounts.dev$').toString('base64url')}`;
    const drifted = await invoke(['journey', '--journey', 'fixture-screen', '--run', runId, '--state-dir', stateDir]);
    const driftedBody = parseJson(drifted);
    assert.equal(drifted.code, 1);
    assert.equal(driftedBody.code, 'identity-mismatch');
    assert.equal(driftedBody.outcome, 'blocked');
    assert.equal(driftedBody.certified, false);
    assert.notEqual(driftedBody.outcome, 'passed');

    const sensitive = [marker, markerHash, 'bank-password-fictional', publishableKey];
    for (const transcript of transcripts) {
      for (const secret of sensitive) assert.equal(transcript.includes(secret), false, 'command output included a sensitive marker');
    }
    const captureRoot = join(stateDir, 'runs', runId, 'nv-captures');
    const { readdir } = await import('node:fs/promises');
    for (const attempt of await readdir(captureRoot)) {
      for (const name of await readdir(join(captureRoot, attempt))) {
        const text = await readFile(join(captureRoot, attempt, name), 'utf8');
        for (const secret of sensitive) assert.equal(text.includes(secret), false, `${name} included a sensitive marker`);
      }
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test('google sign-in journey certifies only a settled dedicated account', { timeout: 120_000 }, async () => {
  const accountLabel = 'fictional.signer@example.test';
  const definition = await readFile(join(repoRoot, 'scripts', 'native-journeys', 'google-sign-in.mjs'), 'utf8');
  const engine = await readFile(join(repoRoot, 'scripts', 'native-verification-journey.mjs'), 'utf8');
  assert.match(definition, /Sign in with Google/);
  assert.match(definition, /certifiesAuthenticatedSignIn: true/);
  assert.match(definition, /SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL/);
  assert.match(definition, /Unmatched Route/);
  assert.match(definition, /Maximum update depth/);
  assert.equal(definition.includes(accountLabel), false);
  assert.equal(definition.includes('pm clear'), false);
  assert.equal(engine.includes('Sign in with Google'), false);
  assert.equal(engine.includes('Loading Spaces.'), false);
  assert.equal(engine.includes('pm clear'), false);

  const directory = await mkdtemp(join(tmpdir(), 'spendeazy-nv-google-'));
  const stateDir = join(directory, 'state');
  const sdk = join(directory, 'sdk');
  await mkdir(sdk);
  const adb = join(directory, 'adb');
  const docker = join(directory, 'docker');
  const scenarioPath = join(directory, 'scenario.json');
  const runId = 'nv-abc123abc124';
  const token = 'f'.repeat(32);
  const source = await sourceIdentity({ repoRoot, processEnv: process.env, secrets: new Set() });
  const publishableKey = `pk_test_${Buffer.from('example.clerk.accounts.dev$').toString('base64url')}`;
  const apiPort = 3011;
  const apiUrl = `http://10.0.2.2:${apiPort}`;
  const installed = {
    packageName,
    versionName: '1.0.0',
    versionCode: '1',
    primaryCpuAbi: 'x86_64',
    lastUpdateTime: '2026-01-01 00:00:00',
  };
  const configFingerprint = configurationFingerprint({
    packageName,
    abi: 'x86_64',
    apiBaseUrl: apiUrl,
    publishableKey,
    androidClientId: '',
  });
  const buildFingerprint = installedFingerprint(configFingerprint, installed);
  const metroPort = await freePort();
  await writeFile(adb, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const scenarioPath = process.env.SPENDEAZY_NV_ADB_SCENARIO;
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const save = () => writeFileSync(scenarioPath, JSON.stringify(scenario));
const args = process.argv.slice(2);
const joined = args.join(' ');
const node = (text, description, bounds) => '<node text="' + text + '" content-desc="' + (description || '') + '" resource-id="" password="false" bounds="' + bounds + '" />';
const screen = (nodes) => "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\\n<hierarchy rotation=\\"0\\">" + nodes + '</hierarchy>';
const signIn = screen(node('Spendeazy', '', '[10,20][110,70]') + node('Sign in with Google', 'Sign in with Google', '[10,90][210,150]'));
const expiredSignIn = screen(node('Spendeazy', '', '[10,20][110,70]') + node('Your session expired. Sign in to continue.', '', '[10,80][400,120]') + node('Sign in with Google', 'Sign in with Google', '[10,90][210,150]'));
const already = screen(node('Dashboard', '', '[10,20][200,80]') + node('Active Space', '', '[10,90][220,130]') + node('Personal', '', '[10,140][220,180]'));
const password = screen(node('Enter your password', '', '[10,80][320,140]'));
const loading = screen(node('Dashboard', '', '[10,20][200,80]') + node('Loading Spaces.', '', '[10,90][240,130]') + node('Active Space', '', '[10,140][220,180]'));
const settled = screen(node('Dashboard', '', '[10,20][200,80]') + node('Active Space', '', '[10,90][220,130]') + node('Personal', '', '[10,140][220,180]') + node('Dashboard', 'Dashboard', '[10,400][80,460]'));
const expiredDash = screen(node('Your session expired. Sign in again to continue.', '', '[10,80][420,140]'));
const chooser = screen(node(process.env.SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL || 'missing-label', '', '[10,200][410,280]'));
function frame() {
  const taps = (scenario.taps || []).length;
  if (scenario.uiMode === 'already-in') return already;
  if (scenario.uiMode === 'expiry-notice') return expiredSignIn;
  if (scenario.uiMode === 'settled') return settled;
  if (scenario.uiMode === 'challenge') return taps === 0 ? signIn : password;
  if (taps === 0) return signIn;
  if (taps === 1) return chooser;
  scenario.settledDumps = (scenario.settledDumps || 0) + 1;
  if (scenario.uiMode === 'flash' && scenario.settledDumps > 2) return expiredDash;
  if (scenario.uiMode !== 'flash' && scenario.settledDumps <= 2) return loading;
  return settled;
}
if (args[0] === 'version') {
  console.log('Android Debug Bridge version 1.0.41');
  process.exit(0);
}
if (args[0] === 'devices') {
  console.log('List of devices attached');
  console.log('emulator-5554\\tdevice product:sdk model:sdk device:emu transport_id:1');
  process.exit(0);
}
if (joined.includes('getprop ro.product.cpu.abi')) {
  console.log('x86_64');
  process.exit(0);
}
if (joined.includes('dumpsys package')) {
  console.log('Package [' + scenario.packageName + ']');
  console.log('versionName=' + scenario.versionName);
  console.log('versionCode=' + scenario.versionCode + ' minSdk=24 targetSdk=36');
  console.log('primaryCpuAbi=' + scenario.primaryCpuAbi);
  console.log('lastUpdateTime=' + scenario.lastUpdateTime);
  process.exit(0);
}
if (joined.includes('pidof')) {
  console.log('4242');
  process.exit(0);
}
if (joined.includes('uiautomator')) {
  scenario.uiXml = frame();
  save();
  console.log('UI hierchary dumped to: ' + args.at(-1));
  process.exit(0);
}
if (args.includes('exec-out')) {
  console.log(scenario.uiXml || '');
  process.exit(0);
}
if (joined.includes('logcat')) {
  if (scenario.uiMode === 'no-device-log') process.exit(1);
  if (scenario.uiMode === 'fatal') {
    console.log('FATAL EXCEPTION: main');
    process.exit(0);
  }
  console.log('ReactNativeJS: screen ready');
  process.exit(0);
}
if (joined.includes('input tap')) {
  scenario.taps = scenario.taps || [];
  scenario.taps.push(args.slice(-2).join(','));
  save();
  process.exit(0);
}
if (args.includes('rm')) process.exit(0);
console.error('unexpected adb ' + joined);
process.exit(1);
`);
  await writeFile(docker, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const scenario = JSON.parse(readFileSync(process.env.SPENDEAZY_NV_ADB_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
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
    for (const container of scenario.containers) {
      if (container.role === role) console.log(container.id);
    }
  }
  process.exit(0);
}
if (args[0] === 'inspect') {
  const id = args.at(-1);
  const container = scenario.containers.find((item) => item.id === id);
  if (!container) process.exit(1);
  console.log([container.id, 'running', '100', '2026-01-01T00:00:00.000Z', 'sha256:image', 'image:local', '/owned', scenario.runId, scenario.token, container.role].join('|'));
  process.exit(0);
}
if (args[0] === 'logs') {
  console.log('api ready');
  process.exit(0);
}
if (args[0] === 'volume' || args[0] === 'network') process.exit(1);
console.error('unexpected docker ' + args.join(' '));
process.exit(1);
`);
  await Promise.all([adb, docker].map((path) => chmod(path, 0o755)));
  const scenario = {
    runId,
    token,
    packageName,
    versionName: installed.versionName,
    versionCode: installed.versionCode,
    primaryCpuAbi: installed.primaryCpuAbi,
    lastUpdateTime: installed.lastUpdateTime,
    uiMode: 'pass',
    uiXml: '',
    taps: [],
    containers: [
      { id: 'db1234567890', role: 'database' },
      { id: 'api1234567890', role: 'api' },
    ],
  };
  await writeFile(scenarioPath, JSON.stringify(scenario));
  const launcher = join(stateDir, 'runs', runId, 'metro-launcher.mjs');
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(launcher, `import { createServer } from 'node:http';
const port = Number(process.argv[2]);
createServer((request, response) => {
  response.end('packager-status:running');
}).listen(port, '127.0.0.1');
`);
  await writeFile(join(stateDir, 'runs', runId, 'launch.log'), 'Metro bundled\n');
  const manifest = {
    schemaVersion: 1,
    manager: 'native-verification',
    runId,
    ownershipToken: token,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phase: 'ready',
    source: {
      root: source.root,
      revision: source.revision,
      dirty: source.dirty,
      fingerprint: source.fingerprint,
    },
    runtime: { platform: process.platform, node: process.version, docker: '24.0.0', compose: '2.29.0' },
    ports: { api: apiPort, database: apiPort + 1 },
    resources: {
      composeProject: 'spendeazy-nv-abc123abc124',
      database: {
        containerId: 'db1234567890',
        volumeName: 'unused-volume',
        networkName: 'unused-network',
        image: 'postgres:16-alpine',
        databaseName: 'nv_test',
        user: 'nv_test',
        pid: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      api: {
        containerId: 'api1234567890',
        imageTag: 'spendeazy-nv-test:local',
        imageId: 'sha256:image',
        pid: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    extensions: {
      device: { serial: 'emulator-5554', abi: 'x86_64', apiUrl, emulator: true },
      nativeBuild: {
        packageName,
        abi: 'x86_64',
        fingerprint: buildFingerprint,
        configurationFingerprint: configFingerprint,
        sourceFingerprint: source.fingerprint,
        apiImageId: 'sha256:image',
        metro: { port: metroPort, endpoint: `http://127.0.0.1:${metroPort}`, launcherPid: 0 },
      },
      evidence: null,
    },
  };
  await writeFile(join(stateDir, 'runs', runId, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const env = {
    ...process.env,
    SPENDEAZY_NV_ANDROID_SDK: sdk,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    SPENDEAZY_NV_ADB: adb,
    SPENDEAZY_NV_DOCKER: docker,
    SPENDEAZY_NV_ADB_SCENARIO: scenarioPath,
    SPENDEAZY_NV_JOURNEY_DIR: join(repoRoot, 'scripts', 'native-journeys'),
    SPENDEAZY_NV_JOURNEY_POLL_MS: '40',
    SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL: accountLabel,
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
  };
  const child = spawn(process.execPath, [launcher, String(metroPort)], { stdio: 'ignore' });
  manifest.extensions.nativeBuild.metro.launcherPid = child.pid;
  await writeFile(join(stateDir, 'runs', runId, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const transcripts = [];
  const invoke = async (args, commandEnv = env) => {
    const result = await runCli(args, commandEnv);
    transcripts.push(`${result.stdout}\n${result.stderr}`);
    return result;
  };
  const setMode = async (uiMode) => {
    const current = JSON.parse(await readFile(scenarioPath, 'utf8'));
    current.uiMode = uiMode;
    current.taps = [];
    current.settledDumps = 0;
    await writeFile(scenarioPath, JSON.stringify(current));
  };
  try {
    const readyDeadline = Date.now() + 5_000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${metroPort}/status`);
        if ((await response.text()).includes('packager-status:running')) {
          ready = true;
          break;
        }
      } catch {
        // Metro is still opening its port.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    assert.equal(ready, true);
    const journeyArgs = ['journey', '--journey', 'google-sign-in', '--run', runId, '--state-dir', stateDir];

    await setMode('already-in');
    const existing = parseJson(await invoke(journeyArgs));
    assert.equal(existing.outcome, 'failed');
    assert.equal(existing.certified, false);
    assert.equal(existing.authenticatedJourneyCertified, false);
    assert.match(existing.journey.assertions[0].reason, /existing session is not sign-in proof/);
    assert.equal(JSON.parse(await readFile(scenarioPath, 'utf8')).taps.length, 0);

    await setMode('expiry-notice');
    const expiry = parseJson(await invoke(journeyArgs));
    assert.equal(expiry.outcome, 'failed');
    assert.equal(expiry.authenticatedJourneyCertified, false);
    assert.equal(expiry.journey.assertions.find((item) => item.id === 'no-session-expiry').outcome, 'failed');
    assert.match(expiry.journey.assertions.find((item) => item.id === 'no-session-expiry').reason, /session expired/);

    await setMode('fatal');
    const crashed = parseJson(await invoke(journeyArgs));
    assert.equal(crashed.outcome, 'failed');
    assert.equal(crashed.authenticatedJourneyCertified, false);
    assert.match(crashed.journey.assertions.find((item) => item.id === 'personal-space-settled').reason, /FATAL EXCEPTION/);

    await setMode('no-device-log');
    const quiet = parseJson(await invoke(journeyArgs));
    assert.equal(quiet.outcome, 'failed');
    assert.equal(quiet.authenticatedJourneyCertified, false);
    assert.match(quiet.journey.assertions.find((item) => item.id === 'personal-space-settled').reason, /device diagnostics were unavailable/);

    await setMode('flash');
    const flashed = parseJson(await invoke(journeyArgs));
    assert.equal(flashed.outcome, 'failed');
    assert.equal(flashed.authenticatedJourneyCertified, false);
    assert.match(flashed.journey.assertions.find((item) => item.id === 'personal-space-settled').reason, /session expired/);

    await setMode('pass');
    const started = Date.now();
    const passed = await invoke(journeyArgs);
    const passedBody = parseJson(passed);
    assert.equal(passed.code, 0, passed.stderr);
    assert.equal(passedBody.outcome, 'passed');
    assert.equal(passedBody.certified, true);
    assert.equal(passedBody.authenticatedJourneyCertified, true);
    assert.match(passedBody.statement, /existing session or a human checkpoint is not a pass/);
    assert.ok(Date.now() - started >= 2_000, 'settled screen was accepted before the hold');
    assert.deepEqual(passedBody.journey.assertions.map((item) => item.outcome), ['passed', 'passed', 'passed', 'passed', 'passed', 'passed']);
    assert.equal(passedBody.journey.claims.softwareChecks.certifies, false);
    assert.equal(passedBody.journey.claims.uiAssertions.certifies, true);
    assert.equal(passedBody.journey.identity.runId, runId);
    assert.equal(passedBody.journey.identity.serial, 'emulator-5554');
    assert.equal(passedBody.journey.identity.nativeBuildFingerprint, buildFingerprint);
    const taps = JSON.parse(await readFile(scenarioPath, 'utf8')).taps;
    assert.deepEqual(taps, ['110,120', '210,240']);

    await setMode('challenge');
    const pending = parseJson(await invoke(journeyArgs));
    assert.equal(pending.outcome, 'human-pending');
    assert.equal(pending.certified, false);
    assert.equal(pending.authenticatedJourneyCertified, false);
    assert.equal(pending.journey.assertions.find((item) => item.id === 'dedicated-account').outcome, 'human-pending');
    assert.equal(pending.journey.assertions.find((item) => item.id === 'personal-space-settled').outcome, 'not-run');
    assert.deepEqual(JSON.parse(await readFile(scenarioPath, 'utf8')).taps, ['110,120']);
    await setMode('settled');
    const resumed = await invoke(['resume', '--journey', 'google-sign-in', '--run', runId, '--state-dir', stateDir]);
    const resumedBody = parseJson(resumed);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(resumedBody.outcome, 'passed');
    assert.equal(resumedBody.authenticatedJourneyCertified, true);
    assert.equal(resumedBody.journey.assertions.some((item) => item.outcome === 'human-pending'), false);

    const unlabeled = { ...env };
    delete unlabeled.SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL;
    await setMode('pass');
    const unlabeledPending = parseJson(await invoke(journeyArgs, unlabeled));
    assert.equal(unlabeledPending.outcome, 'human-pending');
    assert.equal(unlabeledPending.authenticatedJourneyCertified, false);
    assert.match(unlabeledPending.journey.assertions.find((item) => item.id === 'dedicated-account').reason, /ACCOUNT_LABEL is unset/);
    assert.deepEqual(JSON.parse(await readFile(scenarioPath, 'utf8')).taps, ['110,120']);
    await setMode('settled');
    const unlabeledResume = parseJson(await invoke(['resume', '--journey', 'google-sign-in', '--run', runId, '--state-dir', stateDir], unlabeled));
    assert.equal(unlabeledResume.outcome, 'passed');
    assert.equal(unlabeledResume.authenticatedJourneyCertified, true);

    for (const transcript of transcripts) assert.equal(transcript.includes(accountLabel), false, 'command output included the dedicated account label');
    const captureRoot = join(stateDir, 'runs', runId, 'nv-captures');
    const { readdir } = await import('node:fs/promises');
    for (const attempt of await readdir(captureRoot)) {
      for (const name of await readdir(join(captureRoot, attempt))) {
        const text = await readFile(join(captureRoot, attempt, name), 'utf8');
        assert.equal(text.includes(accountLabel), false, `${name} included the dedicated account label`);
      }
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
