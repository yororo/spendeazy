import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, readlink, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import {
  VerificationError,
  docker,
  observe,
  publicBody,
  readManifest,
  redact,
  rememberCredential,
  requireOwnedDatabase,
  resolveSelected,
  runProcess,
  sourceIdentity,
  tail,
  writeManifest,
  nativeInputFingerprintOf,
  jsInputFingerprintOf,
} from './native-verification.mjs';

const statement = 'Launch alone does not certify an authenticated journey.';
const launcherSource = `import { spawn } from 'node:child_process';
import { openSync, writeFileSync } from 'node:fs';

writeFileSync(process.env.SPENDEAZY_NV_METRO_PID_FILE, String(process.pid));
const logFd = openSync(process.env.SPENDEAZY_NV_LAUNCH_LOG, 'a');
const expoBin = process.argv[2];
const mode = process.argv[3];
const expoArgs = process.argv.slice(4);
const command = mode === '--node' ? process.execPath : expoBin;
const args = mode === '--node' ? [expoBin, ...expoArgs] : expoArgs;
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
});
child.on('error', () => process.exit(127));
child.on('exit', (code) => process.exit(code ?? 1));
`;

function block(code, message) {
  throw new VerificationError(code, message, 'blocked');
}

function fail(code, message) {
  throw new VerificationError(code, message, 'failed');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function configuredInt(value, fallback, name, max) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new VerificationError('usage', `${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new VerificationError('usage', `${name} is outside the supported range.`);
  }
  return parsed;
}

function runDirectory(context, runId) {
  return join(context.stateDir, 'runs', runId);
}

function sdkRoot(context, required) {
  const root = context.processEnv.SPENDEAZY_NV_ANDROID_SDK
    || context.processEnv.ANDROID_SDK_ROOT
    || context.processEnv.ANDROID_HOME
    || '';
  if (!root) {
    if (!required) return '';
    block('host-capability', 'Android SDK root is unset. Set ANDROID_HOME, ANDROID_SDK_ROOT, or SPENDEAZY_NV_ANDROID_SDK. On Windows the SDK is often under %LOCALAPPDATA%\\Android\\Sdk.');
  }
  return root;
}

function adbBin(context) {
  if (context.processEnv.SPENDEAZY_NV_ADB) return context.processEnv.SPENDEAZY_NV_ADB;
  const root = sdkRoot(context, false);
  if (root) return join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return 'adb';
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function runTool(context, command, args, name, hint) {
  const result = await runProcess(command, args, {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
    timeoutMs: 20_000,
  });
  if (result.missing || result.code !== 0) {
    block('host-capability', `${name} is not available. ${hint}`);
  }
}

export async function preflightHost(context, { requireBuildTools }) {
  if (requireBuildTools) {
    const root = sdkRoot(context, true);
    if (!await pathExists(root)) {
      block('host-capability', `Android SDK directory ${root} does not exist. Set ANDROID_HOME or SPENDEAZY_NV_ANDROID_SDK to the installed SDK.`);
    }
    await runTool(context, adbBin(context), ['version'], 'adb', 'Install Android SDK platform-tools. Set SPENDEAZY_NV_ADB when adb is not inside that SDK.');
    const java = context.processEnv.SPENDEAZY_NV_JAVA || 'java';
    await runTool(context, java, ['-version'], 'java', 'Install a JDK and put java on PATH, or set SPENDEAZY_NV_JAVA. This command does not download a JDK.');
    const expo = context.processEnv.SPENDEAZY_NV_EXPO || join(context.repoRoot, 'mobile-app', 'node_modules', 'expo', 'bin', 'cli');
    if (!await pathExists(expo)) {
      block('host-capability', 'The Expo CLI is missing. Run npm ci --prefix mobile-app, or set SPENDEAZY_NV_EXPO to the Expo executable.');
    }
  } else {
    await runTool(context, adbBin(context), ['version'], 'adb', 'Install Android SDK platform-tools or set SPENDEAZY_NV_ADB.');
  }
  if (typeof WebSocket !== 'function') {
    block('host-capability', 'This Node.js build has no WebSocket client, so Expo Metro reload is unavailable.');
  }
}

async function adb(context, args, { timeoutMs = 20_000, allowFailure = false } = {}) {
  const result = await runProcess(adbBin(context), args, {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
    timeoutMs,
  });
  if (result.missing) block('host-capability', 'adb is not available. Install Android SDK platform-tools or set SPENDEAZY_NV_ADB.');
  if (result.timedOut) fail('launch-failed', 'adb timed out. The command did not retry.');
  if (result.code !== 0 && !allowFailure) {
    fail('launch-failed', `adb ${args[0]} failed.\n${tail(result.stderr || result.stdout, 20)}`);
  }
  return result;
}

function parseDevices(text) {
  const devices = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('List of devices') || trimmed.startsWith('*')) continue;
    const [serial, state] = trimmed.split(/\s+/);
    if (serial && state) devices.push({ serial, state });
  }
  return devices;
}

async function listDevices(context) {
  const result = await adb(context, ['devices', '-l']);
  return parseDevices(result.stdout);
}

async function bootAvd(context, name) {
  const root = sdkRoot(context, true);
  const emulator = context.processEnv.SPENDEAZY_NV_EMULATOR
    || join(root, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  const args = ['-avd', name];
  if (context.processEnv.SPENDEAZY_NV_EMULATOR_HEADLESS === '1') {
    args.push('-no-window', '-no-audio', '-gpu', 'swiftshader_indirect', '-no-boot-anim');
  }
  const child = spawn(emulator, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  if (!child.pid) block('host-capability', 'The emulator did not start. Install the Android emulator package or set SPENDEAZY_NV_EMULATOR.');
  const timeout = configuredInt(context.processEnv.SPENDEAZY_NV_BOOT_TIMEOUT_MS, 600_000, 'SPENDEAZY_NV_BOOT_TIMEOUT_MS', 3_600_000);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const online = (await listDevices(context)).filter((device) => device.state === 'device');
    if (online.length === 1) return child.pid;
    if (online.length > 1) {
      block('multiple-devices', `AVD ${name} booted alongside other devices: ${online.map((device) => device.serial).join(', ')}. Pass --serial.`);
    }
    await delay(2000);
  }
  block('no-device', `AVD ${name} did not present an authorized device before the boot deadline. The command did not start another emulator.`);
  return null;
}

async function selectDevice(context, options) {
  let devices = await listDevices(context);
  const online = devices.filter((device) => device.state === 'device');
  let emulatorPid = null;
  if (online.length === 0 && options.bootAvd) {
    if (devices.length > 0) {
      block('host-capability', `An Android device is attached but not ready (${devices.map((device) => `${device.serial} ${device.state}`).join(', ')}). Approve USB debugging if the state is unauthorized. The command did not boot another AVD and did not retry.`);
    }
    emulatorPid = await bootAvd(context, options.bootAvd);
    devices = await listDevices(context);
  }
  const ready = devices.filter((device) => device.state === 'device');
  let selected = null;
  if (options.serial) {
    selected = devices.find((device) => device.serial === options.serial) || null;
    if (!selected) {
      block('no-device', `Android serial ${options.serial} is not attached. Attached devices: ${devices.map((device) => `${device.serial} ${device.state}`).join(', ') || 'none'}.`);
    }
  } else if (ready.length === 1) {
    selected = ready[0];
  } else if (ready.length > 1) {
    block('multiple-devices', `Several Android devices are attached: ${ready.map((device) => device.serial).join(', ')}. Pass --serial.`);
  } else if (devices.length === 1 && devices[0].state === 'unauthorized') {
    block('host-capability', `Device ${devices[0].serial} is unauthorized. Approve USB debugging for this computer, then run launch again. The command does not retry the approval prompt.`);
  } else if (devices.length > 0) {
    block('multiple-devices', `No single ready Android device is attached: ${devices.map((device) => `${device.serial} ${device.state}`).join(', ')}. Pass --serial after the device is authorized.`);
  } else {
    block('no-device', 'No Android device is attached. Start an emulator, or pass --boot-avd with the AVD name. The command did not guess a device.');
  }
  if (selected.state === 'unauthorized') {
    block('host-capability', `Device ${selected.serial} is unauthorized. Approve USB debugging for this computer, then run launch again. The command does not retry the approval prompt.`);
  }
  if (selected.state !== 'device') {
    block('no-device', `Device ${selected.serial} is ${selected.state}. Wait until adb reports it as device, then run launch again.`);
  }
  return { ...selected, emulatorPid };
}

async function deviceProperty(context, serial, name) {
  const result = await adb(context, ['-s', serial, 'shell', 'getprop', name], { allowFailure: true });
  if (result.code !== 0) return '';
  return result.stdout.trim();
}

export function configurationFingerprint(parts) {
  return createHash('sha256').update([
    parts.packageName,
    parts.abi,
    parts.apiBaseUrl,
    parts.publishableKey,
    parts.androidClientId,
  ].join('\0')).digest('hex');
}

export function installedFingerprint(configuration, installed) {
  return createHash('sha256').update([
    installed.packageName,
    installed.versionName,
    installed.versionCode,
    installed.primaryCpuAbi,
    installed.lastUpdateTime,
    configuration,
  ].join('\0')).digest('hex');
}

async function readAppIdentity(context) {
  const text = await readFile(join(context.repoRoot, 'mobile-app', 'app.json'), 'utf8');
  const config = JSON.parse(text);
  const packageName = config?.expo?.android?.package;
  if (!packageName || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
    block('missing-configuration', 'mobile-app/app.json has no Android package identity.');
  }
  return packageName;
}

function decodePublishableKey(value) {
  const match = /^pk_(test|live)_([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) block('incompatible-public-config', 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key.');
  if (match[1] !== 'test') {
    block('incompatible-public-config', 'Native verification requires a Clerk development publishable key (pk_test_). A production publishable key is not accepted.');
  }
  let encoded = match[2].replaceAll('-', '+').replaceAll('_', '/');
  while (encoded.length % 4) encoded += '=';
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  if (!decoded.endsWith('$')) block('incompatible-public-config', 'The publishable key does not identify a Clerk frontend API.');
  const frontendApi = decoded.slice(0, -1);
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(frontendApi)) {
    block('incompatible-public-config', 'The publishable key does not identify a Clerk frontend API.');
  }
  return frontendApi;
}

function normalizePem(value) {
  return String(value || '').trim().replaceAll('\\n', '\n');
}

async function containerEnv(context, containerId) {
  const result = await docker([
    'inspect',
    '--type', 'container',
    '--format',
    '{{range .Config.Env}}{{println .}}{{end}}',
    containerId,
  ], context, { allowFailure: true, redactOutput: false });
  if (result.code !== 0) block('api-unready', 'The owned API container could not be inspected. A healthy host port is not enough.');
  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    values[key] = value;
    rememberCredential(context.secrets, value);
    rememberCredential(context.secrets, normalizePem(value));
  }
  return values;
}

async function clerkCompatible(context, env, frontendApi) {
  const secret = env.CLERK_SECRET_KEY?.trim() || '';
  const jwt = normalizePem(env.CLERK_JWT_KEY);
  if (!secret || !jwt) {
    block('missing-configuration', 'The running API is missing CLERK_JWT_KEY or CLERK_SECRET_KEY. Export the development Clerk values and start a new owned run. Editing an environment file does not change the running API.');
  }
  if (/^sk_live_/.test(secret)) {
    block('incompatible-public-config', 'The running API is using a production Clerk secret key. Native verification requires a development instance (sk_test_).');
  }
  if (!/^sk_test_\S+$/.test(secret)) {
    block('missing-configuration', 'The running API Clerk secret key is not a development secret key.');
  }
  let local;
  try {
    local = createPublicKey(jwt).export({ format: 'jwk' });
  } catch {
    block('missing-configuration', 'The running API CLERK_JWT_KEY is not a PEM public key.');
  }
  if (local.kty !== 'RSA' || !local.n || !local.e) {
    block('missing-configuration', 'The running API CLERK_JWT_KEY is not an RSA public key.');
  }
  const loopback = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(frontendApi);
  const url = `${loopback ? 'http' : 'https'}://${frontendApi}/.well-known/jwks.json`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    block('clerk-instance-unreachable', 'The publishable key instance did not return its public JWKS. The launch was not started.');
  }
  if (!response.ok) block('incompatible-public-config', 'The publishable key instance rejected the public JWKS request.');
  let body;
  try {
    body = await response.json();
  } catch {
    block('incompatible-public-config', 'The publishable key instance did not return a JWKS document.');
  }
  const keys = Array.isArray(body.keys) ? body.keys : [];
  const matches = keys.some((key) => key && key.n === local.n && key.e === local.e);
  if (!matches) {
    block('incompatible-public-config', 'The publishable key instance does not match the running API Clerk verification key.');
  }
  return frontendApi;
}

async function hostApiReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5_000) });
    const body = await response.json();
    if (!response.ok || body?.status !== 'ok') block('api-unready', `The owned API on 127.0.0.1:${port} is not ready.`);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    block('api-unready', `The owned API on 127.0.0.1:${port} is not ready.`);
  }
}

function assertSafeProbeTarget(host, port, file) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !/^[A-Za-z0-9.-]+$/.test(host)) {
    block('usage', 'The device API host is not safe to probe.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) block('usage', 'The API port is not safe to probe.');
  if (!/^\/data\/local\/tmp\/nv-[0-9a-f]{12}-health$/.test(file)) {
    block('usage', 'The device probe path is not safe.');
  }
}

async function probeDevice(context, serial, host, port, runId) {
  const file = `/data/local/tmp/${runId}-health`;
  assertSafeProbeTarget(host, port, file);
  const script = `(printf 'GET /health HTTP/1.0\\r\\nHost: ${host}\\r\\n\\r\\n'; sleep 1) | nc -W 2 -w 5 ${host} ${port} > ${file}`;
  const probed = await adb(context, ['-s', serial, 'shell', script], { timeoutMs: 20_000, allowFailure: true });
  if (probed.code !== 0) {
    await adb(context, ['-s', serial, 'shell', 'rm', '-f', file], { allowFailure: true });
    return false;
  }
  const body = await adb(context, ['-s', serial, 'exec-out', 'cat', file], { allowFailure: true });
  await adb(context, ['-s', serial, 'shell', 'rm', '-f', file], { allowFailure: true });
  return body.code === 0 && body.stdout.includes('"status":"ok"');
}

async function reverseListed(context, serial, port) {
  const result = await adb(context, ['-s', serial, 'reverse', '--list'], { allowFailure: true });
  return result.code === 0 && result.stdout.includes(`tcp:${port}`);
}

async function establishDeviceApi(context, { serial, emulator, port, runId, explicitHost }) {
  if (explicitHost) {
    const reachable = await probeDevice(context, serial, explicitHost, port, runId);
    if (!reachable) {
      fail('device-api-unreachable', `The device could not reach http://${explicitHost}:${port}/health. The command did not substitute another address.`);
    }
    return { apiHost: explicitHost, apiUrl: `http://${explicitHost}:${port}`, adbReverse: false, addedReverse: false };
  }
  if (emulator) {
    const alias = await probeDevice(context, serial, '10.0.2.2', port, runId);
    if (alias) {
      return { apiHost: '10.0.2.2', apiUrl: `http://10.0.2.2:${port}`, adbReverse: false, addedReverse: false };
    }
  }
  const already = await reverseListed(context, serial, port);
  if (!already) {
    const added = await adb(context, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], { allowFailure: true });
    if (added.code !== 0) {
      fail('device-api-unreachable', 'adb reverse could not publish the owned API port on the device.');
    }
  }
  const reversed = await probeDevice(context, serial, '127.0.0.1', port, runId);
  if (!reversed) {
    if (!already) await adb(context, ['-s', serial, 'reverse', '--remove', `tcp:${port}`], { allowFailure: true });
    fail('device-api-unreachable', `The device could not reach the owned API on port ${port} through 10.0.2.2 or adb reverse.`);
  }
  return { apiHost: '127.0.0.1', apiUrl: `http://127.0.0.1:${port}`, adbReverse: true, addedReverse: !already };
}

async function listenerPids(port) {
  if (process.platform === 'win32') {
    const result = await runProcess('netstat', ['-ano', '-p', 'tcp'], {
      env: process.env,
      secrets: new Set(),
      timeoutMs: 15_000,
    });
    if (result.code !== 0) block('host-capability', 'netstat could not identify the Metro listener. The command will not guess which process owns the port.');
    const pids = [];
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.trim().match(new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)$`, 'i'));
      if (match) pids.push(Number(match[1]));
    }
    return [...new Set(pids)];
  }
  const listed = await runProcess('ss', ['-H', '-ltnp', `sport = :${port}`], {
    env: process.env,
    secrets: new Set(),
    timeoutMs: 10_000,
  });
  if (!listed.missing && listed.code === 0) {
    return [...new Set([...listed.stdout.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1])))];
  }
  const inodes = new Set();
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try {
      text = await readFile(table, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const local = parts[1] || '';
      if (!local.toUpperCase().endsWith(`:${hexPort}`)) continue;
      if (parts[3] !== '0A') continue;
      inodes.add(parts[9]);
    }
  }
  if (inodes.size === 0) return [];
  const pids = [];
  const entries = await readdir('/proc');
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let fds = [];
    try {
      fds = await readdir(`/proc/${entry}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const target = await readlink(`/proc/${entry}/fd/${fd}`);
        const inode = target.match(/^socket:\[(\d+)\]$/);
        if (inode && inodes.has(inode[1])) pids.push(Number(entry));
      } catch {
        // The process exited while it was being inspected.
      }
    }
  }
  return [...new Set(pids)];
}

async function commandLine(pid) {
  if (process.platform === 'win32') {
    const result = await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ], { env: process.env, secrets: new Set(), timeoutMs: 15_000 });
    return result.code === 0 ? result.stdout : '';
  }
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`);
    return raw.toString('utf8').replaceAll('\0', ' ');
  } catch {
    return '';
  }
}

async function parentPid(pid) {
  if (process.platform === 'win32') {
    const result = await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`,
    ], { env: process.env, secrets: new Set(), timeoutMs: 15_000 });
    const parsed = Number(result.stdout.trim());
    return Number.isInteger(parsed) ? parsed : 0;
  }
  try {
    const text = await readFile(`/proc/${pid}/status`, 'utf8');
    return Number(text.match(/^PPid:\s+(\d+)/m)?.[1] || 0);
  } catch {
    return 0;
  }
}

async function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  if (process.platform === 'win32') {
    const result = await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Id`,
    ], { env: process.env, secrets: new Set(), timeoutMs: 15_000 });
    return result.stdout.trim() === String(pid);
  }
  try {
    await access(`/proc/${pid}`);
    return true;
  } catch {
    return false;
  }
}

function launcherMarker(runId) {
  return `runs/${runId}/metro-launcher`.replaceAll('/', process.platform === 'win32' ? '\\' : '/');
}

async function ownedLauncherPid(pid, runId) {
  let current = pid;
  for (let depth = 0; depth < 15 && current > 1; depth += 1) {
    const line = await commandLine(current);
    if (line.includes(launcherMarker(runId)) || line.includes(`runs/${runId}/metro-launcher`)) return current;
    const parent = await parentPid(current);
    if (!parent || parent === current) return 0;
    current = parent;
  }
  return 0;
}

async function assertMetroPortAvailable(context, manifest, port) {
  const listeners = await listenerPids(port);
  if (listeners.length === 0) return;
  for (const pid of listeners) {
    if (await ownedLauncherPid(pid, manifest.runId)) return;
  }
  block('port-conflict', `Metro port ${port} is held by another process. Pass --metro-port to select a free port. The existing listener was left untouched.`);
}

async function readInstalledPackage(context, serial, packageName) {
  const result = await adb(context, ['-s', serial, 'shell', 'dumpsys', 'package', packageName], { allowFailure: true });
  if (result.code !== 0 || !result.stdout.includes(packageName)) return null;
  const versionName = result.stdout.match(/versionName=(\S+)/)?.[1] || '';
  const versionCode = result.stdout.match(/versionCode=(\d+)/)?.[1] || '';
  const primaryCpuAbi = result.stdout.match(/primaryCpuAbi=(\S+)/)?.[1] || '';
  const lastUpdateTime = result.stdout.match(/lastUpdateTime=([^\n]+)/)?.[1]?.trim() || '';
  if (!versionName || !versionCode || !primaryCpuAbi || !lastUpdateTime) return null;
  return { packageName, versionName, versionCode, primaryCpuAbi, lastUpdateTime };
}

async function appRunning(context, serial, packageName) {
  const result = await adb(context, ['-s', serial, 'shell', 'pidof', packageName], { allowFailure: true });
  return result.code === 0 && /\d/.test(result.stdout);
}

async function portFree(port) {
  if ((await listenerPids(port)).length > 0) return false;
  const server = createServer();
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolveListen);
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE') return false;
    throw error;
  }
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return true;
}

async function metroStatus(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(2_000) });
    const text = await response.text();
    return response.ok && text.includes('packager-status:running');
  } catch {
    return false;
  }
}

async function fetchBundle(port, expected, timeoutMs) {
  const paths = [
    '/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false',
    '/index.bundle?platform=android&dev=true&minify=false',
    '/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false',
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const path of paths) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) continue;
        const body = await response.text();
        if (expected.every((value) => value && body.includes(value))) {
          return { path, digest: createHash('sha256').update(body).digest('hex') };
        }
      } catch {
        // The bundle is still compiling.
      }
    }
    await delay(500);
  }
  return null;
}

async function bundleContains(port, expected, timeoutMs) {
  return Boolean(await fetchBundle(port, expected, timeoutMs));
}

function maskedWebsocketFrame(opcode, payload) {
  const body = Buffer.from(payload);
  const mask = randomBytes(4);
  const length = body.length < 126
    ? Buffer.from([0x80 | body.length])
    : Buffer.from([0x80 | 126, (body.length >> 8) & 0xff, body.length & 0xff]);
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) masked[index] = body[index] ^ mask[index % 4];
  return Buffer.concat([Buffer.from([0x80 | opcode]), length, mask, masked]);
}

async function reloadSocket(port) {
  await new Promise((resolveSocket, reject) => {
    let settled = false;
    let timer = null;
    const finish = (error, socket) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (socket) socket.destroy();
      if (error) reject(error);
      else resolveSocket();
    };
    const failReload = (socket) => finish(new VerificationError('reload-failed', 'Metro did not accept the Expo reload connection.', 'failed'), socket);
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      path: '/message',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
      },
    });
    timer = setTimeout(() => {
      req.destroy();
      failReload();
    }, 5_000);
    req.once('upgrade', (response, socket) => {
      socket.on('error', () => failReload(socket));
      const payload = Buffer.from(JSON.stringify({ version: 2, method: 'reload' }));
      socket.write(maskedWebsocketFrame(0x1, payload));
      socket.end(maskedWebsocketFrame(0x8, Buffer.alloc(0)), () => finish(null, socket));
    });
    req.once('response', (response) => {
      response.resume();
      req.destroy();
      failReload();
    });
    req.once('error', () => failReload());
    req.end();
  });
}

function gradleMaxWorkers(context) {
  const workers = context.processEnv.SPENDEAZY_NV_GRADLE_MAX_WORKERS;
  if (workers === undefined || workers === '') return null;
  return configuredInt(workers, 1, 'SPENDEAZY_NV_GRADLE_MAX_WORKERS', 64);
}

function appRoot(context) {
  return join(context.repoRoot, 'mobile-app');
}

function httpBodyDigest(stdout) {
  let index = stdout.indexOf('\r\n\r\n');
  let separator = 4;
  if (index === -1) {
    index = stdout.indexOf('\n\n');
    separator = 2;
  }
  if (index === -1) return '';
  return createHash('sha256').update(stdout.slice(index + separator)).digest('hex');
}

function previousEvidenceCertifies(manifest, source, { nativeChanged, configChanged, jsInputFingerprint, nativeInputFingerprint }) {
  if (nativeChanged || configChanged) return false;
  const refresh = manifest.extensions?.evidence?.refresh;
  if (refresh) {
    return refresh.certifiesCurrentRevision === true
      && refresh.sourceFingerprint === source.fingerprint
      && refresh.jsInputFingerprint === jsInputFingerprint
      && refresh.nativeInputFingerprint === nativeInputFingerprint;
  }
  const build = manifest.extensions?.nativeBuild;
  return manifest.extensions?.evidence?.launch?.certifiesCurrentRevision === true
    && build?.sourceFingerprint === source.fingerprint
    && build?.jsInputFingerprint === jsInputFingerprint
    && build?.nativeInputFingerprint === nativeInputFingerprint;
}

function launchEnvironment(context, manifest, config) {
  const env = { ...context.processEnv };
  for (const name of ['CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'SPENDEAZY_NV_DB_PASSWORD', 'CI']) delete env[name];
  const sdk = sdkRoot(context, true);
  env.ANDROID_HOME = sdk;
  env.ANDROID_SDK_ROOT = sdk;
  env.EXPO_NO_DOTENV = '1';
  env.EXPO_NO_TELEMETRY = '1';
  env.EXPO_PUBLIC_API_BASE_URL = config.apiBaseUrl;
  env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = config.publishableKey;
  if (config.androidClientId) env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID = config.androidClientId;
  else delete env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID;
  env.SPENDEAZY_NV_RUN_ID = manifest.runId;
  env.SPENDEAZY_NV_METRO_PID_FILE = join(runDirectory(context, manifest.runId), 'metro.pid');
  env.SPENDEAZY_NV_LAUNCH_LOG = join(runDirectory(context, manifest.runId), 'launch.log');
  const workers = gradleMaxWorkers(context);
  if (workers) {
    env.GRADLE_OPTS = `${env.GRADLE_OPTS || ''} -Dorg.gradle.workers.max=${workers}`.trim();
  }
  if (config.abi) env.ORG_GRADLE_PROJECT_reactNativeArchitectures = config.abi;
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const tools = join(sdk, 'platform-tools');
  env[pathKey] = `${tools}${process.platform === 'win32' ? ';' : ':'}${env[pathKey] || env.PATH || ''}`;
  return env;
}

async function readLaunchLog(context, runId) {
  try {
    return redact(await readFile(join(runDirectory(context, runId), 'launch.log'), 'utf8'), context.secrets);
  } catch {
    return '';
  }
}

async function waitForLaunch(context, { manifest, serial, packageName, port, expected, launcherPid }) {
  const timeout = configuredInt(context.processEnv.SPENDEAZY_NV_LAUNCH_TIMEOUT_MS, 1_800_000, 'SPENDEAZY_NV_LAUNCH_TIMEOUT_MS', 7_200_000);
  const bundleTimeout = configuredInt(context.processEnv.SPENDEAZY_NV_BUNDLE_TIMEOUT_MS, 180_000, 'SPENDEAZY_NV_BUNDLE_TIMEOUT_MS', 1_800_000);
  const deadline = Date.now() + timeout;
  let statusSeen = false;
  while (Date.now() < deadline) {
    if (!await processAlive(launcherPid)) {
      fail('launch-failed', `The Expo launch process exited before Metro was ready.\n${tail(await readLaunchLog(context, manifest.runId), 30)}`);
    }
    if (await metroStatus(port)) {
      statusSeen = true;
      break;
    }
    await delay(500);
  }
  if (!statusSeen) {
    fail('launch-failed', `Metro did not become ready on 127.0.0.1:${port}.\n${tail(await readLaunchLog(context, manifest.runId), 30)}`);
  }
  const bundle = await fetchBundle(port, expected, Math.min(bundleTimeout, Math.max(1_000, deadline - Date.now())));
  if (!bundle) {
    fail('running-config-mismatch', 'The Metro bundle does not contain the launch API address and publishable key. An environment-file edit was not accepted as the running configuration.');
  }
  const installedDeadline = Date.now() + Math.max(1_000, deadline - Date.now());
  let installed = null;
  while (Date.now() < installedDeadline) {
    installed = await readInstalledPackage(context, serial, packageName);
    if (installed && await appRunning(context, serial, packageName)) break;
    installed = null;
    await delay(500);
  }
  if (!installed) {
    fail('launch-failed', `Expo did not leave ${packageName} installed and running on ${serial}.\n${tail(await readLaunchLog(context, manifest.runId), 30)}`);
  }
  return { installed, bundle };
}

async function killPid(pid) {
  if (process.platform === 'win32') {
    await runProcess('taskkill', ['/PID', String(pid), '/T', '/F'], { env: process.env, secrets: new Set(), timeoutMs: 15_000 });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process already exited.
    }
  }
}

export async function stopOwnedMetro(context, manifest, report) {
  const metro = manifest.extensions?.nativeBuild?.metro;
  const serial = manifest.extensions?.device?.serial;
  const port = metro?.port;
  const recordedPid = metro?.launcherPid;
  if (!port || !recordedPid) return;
  const listeners = await listenerPids(port).catch(() => []);
  let launcherPid = 0;
  for (const pid of listeners) {
    launcherPid = await ownedLauncherPid(pid, manifest.runId);
    if (launcherPid) break;
  }
  if (!launcherPid && await processAlive(recordedPid)) {
    launcherPid = await ownedLauncherPid(recordedPid, manifest.runId);
  }
  if (!launcherPid) {
    report.skipped.push({ type: 'metro', id: String(recordedPid), reason: 'not-owned' });
    return;
  }
  await killPid(launcherPid);
  for (let attempt = 0; attempt < 10 && await processAlive(launcherPid); attempt += 1) await delay(100);
  if (await processAlive(launcherPid)) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-launcherPid, 'SIGKILL');
      } catch {
        try {
          process.kill(launcherPid, 'SIGKILL');
        } catch {
          // The process exited between the checks.
        }
      }
    }
  }
  if (await processAlive(launcherPid)) {
    report.skipped.push({ type: 'metro', id: String(launcherPid), reason: 'remove-failed' });
    return;
  }
  report.removed.processes = report.removed.processes || [];
  report.removed.processes.push(launcherPid);
  if (manifest.extensions?.device?.adbReverse && serial && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(serial)) {
    await runProcess(adbBin(context), ['-s', serial, 'reverse', '--remove', `tcp:${manifest.ports.api}`], {
      env: context.processEnv,
      secrets: context.secrets,
      timeoutMs: 15_000,
    });
  }
}

function publicLaunch(context, manifest, operation, readiness, outcome = null) {
  const resolvedOutcome = outcome || (operation === 'reload' ? 'reloaded' : 'launched');
  return publicBody(context, manifest, {
    operation,
    extra: {
      outcome: resolvedOutcome,
      authenticatedJourneyCertified: false,
      statement,
      readiness,
    },
  });
}

async function withLaunchOutcome(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof VerificationError && !error.outcome) {
      throw new VerificationError(error.code, error.message, 'blocked');
    }
    throw error;
  }
}

async function startOwnedExpo(context, manifest, { config, expoArgs, resetLog }) {
  const directory = runDirectory(context, manifest.runId);
  await mkdir(directory, { recursive: true });
  const launcher = join(directory, 'metro-launcher.mjs');
  await writeFile(launcher, launcherSource);
  await rm(join(directory, 'metro.pid'), { force: true });
  if (resetLog) await rm(join(directory, 'launch.log'), { force: true });
  const launchEnv = launchEnvironment(context, manifest, config);
  const expoBin = context.processEnv.SPENDEAZY_NV_EXPO || join(context.repoRoot, 'mobile-app', 'node_modules', 'expo', 'bin', 'cli');
  const mode = context.processEnv.SPENDEAZY_NV_EXPO ? '--direct' : '--node';
  const child = spawn(process.execPath, [launcher, expoBin, mode, ...expoArgs], {
    cwd: appRoot(context),
    env: launchEnv,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  const pidDeadline = Date.now() + 15_000;
  let launcherPid = 0;
  while (Date.now() < pidDeadline) {
    try {
      launcherPid = Number((await readFile(join(directory, 'metro.pid'), 'utf8')).trim());
    } catch {
      launcherPid = 0;
    }
    if (launcherPid > 1) break;
    await delay(100);
  }
  if (!launcherPid) fail('launch-failed', 'The Expo launcher did not record its process id.');
  return launcherPid;
}

export async function launchNative(context, options) {
  return withLaunchOutcome(async () => {
    const publishableKey = context.processEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
    if (!publishableKey) {
      block('missing-configuration', 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in the launch environment. A mobile env file is not the running configuration.');
    }
    const frontendApi = decodePublishableKey(publishableKey);
    const androidClientId = context.processEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
    const packageName = await readAppIdentity(context);
    const source = await sourceIdentity(context);
    const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
    const selected = await selectDevice(context, options);
    const abi = await deviceProperty(context, selected.serial, 'ro.product.cpu.abi');
    if (!abi) block('host-capability', `adb could not read the ABI for ${selected.serial}.`);
    if (options.abi && options.abi !== abi) {
      block('identity-mismatch', `Device ${selected.serial} is ${abi}. The requested ABI was ${options.abi}.`);
    }
    const recordedDevice = manifest.extensions?.device?.serial;
    if (recordedDevice && recordedDevice !== selected.serial) {
      block('identity-mismatch', `Run ${manifest.runId} is recorded on ${recordedDevice}. ${selected.serial} was not accepted as that device.`);
    }
    const recordedAbi = manifest.extensions?.nativeBuild?.abi || manifest.extensions?.device?.abi;
    if (recordedAbi && recordedAbi !== abi) {
      block('identity-mismatch', `Run ${manifest.runId} is recorded for ABI ${recordedAbi}. This device is ${abi}.`);
    }
    const qemu = await deviceProperty(context, selected.serial, 'ro.kernel.qemu');
    const emulator = selected.serial.startsWith('emulator-') || qemu === '1';
    await requireOwnedDatabase(context, manifest);
    const observation = await observe(context, manifest);
    if (!observation.api.identityMatches || observation.api.status !== 'running') {
      block('api-unready', `Run ${manifest.runId} has no running owned API. Start or replace the API before launching.`);
    }
    await hostApiReady(manifest.ports.api);
    const env = await containerEnv(context, observation.api.id);
    const clerkFrontendApi = await clerkCompatible(context, env, frontendApi);
    const explicitHost = options.deviceApiHost || context.processEnv.SPENDEAZY_NV_DEVICE_API_HOST || '';
    let addedReverse = false;
    let deviceApi;
    try {
      deviceApi = await establishDeviceApi(context, {
        serial: selected.serial,
        emulator,
        port: manifest.ports.api,
        runId: manifest.runId,
        explicitHost,
      });
      addedReverse = deviceApi.addedReverse;
      const configFingerprint = configurationFingerprint({
        packageName,
        abi,
        apiBaseUrl: deviceApi.apiUrl,
        publishableKey,
        androidClientId,
      });
      const recordedConfig = manifest.extensions?.nativeBuild?.configurationFingerprint;
      if (recordedConfig && recordedConfig !== configFingerprint) {
        block('identity-mismatch', `Run ${manifest.runId} has a different native configuration. The current environment was not applied over that build.`);
      }
      const recordedBuild = manifest.extensions?.nativeBuild?.fingerprint;
      if (recordedBuild) {
        const installed = await readInstalledPackage(context, selected.serial, packageName);
        const current = installed ? installedFingerprint(configFingerprint, installed) : '';
        if (!installed || current !== recordedBuild) {
          block('identity-mismatch', `The installed ${packageName} build on ${selected.serial} does not match run ${manifest.runId}.`);
        }
      }
      const metroPort = options.metroPort
        || configuredInt(context.processEnv.SPENDEAZY_NV_METRO_PORT, 8081, 'SPENDEAZY_NV_METRO_PORT', 65535);
      await assertMetroPortAvailable(context, manifest, metroPort);
      if ((await listenerPids(metroPort)).length > 0) {
        const report = { removed: { processes: [] }, skipped: [] };
        await stopOwnedMetro(context, manifest, report);
        if (report.skipped.some((entry) => entry.type === 'metro')) {
          block('port-conflict', `Metro port ${metroPort} is still held. Pass --metro-port to select a free port.`);
        }
      }
      if (!await portFree(metroPort)) {
        block('port-conflict', `Metro port ${metroPort} is held by another process. Pass --metro-port to select a free port. The existing listener was left untouched.`);
      }
      const launcherPid = await startOwnedExpo(context, manifest, {
        config: {
          apiBaseUrl: deviceApi.apiUrl,
          publishableKey,
          androidClientId,
          abi,
        },
        expoArgs: ['run:android', '--device', selected.serial, '--port', String(metroPort)],
        resetLog: true,
      });
      const launchedApp = await waitForLaunch(context, {
        manifest,
        serial: selected.serial,
        packageName,
        port: metroPort,
        expected: [deviceApi.apiUrl, publishableKey],
        launcherPid,
      });
      const installed = launchedApp.installed;
      const fingerprint = installedFingerprint(configFingerprint, installed);
      const nativeInputFingerprint = await nativeInputFingerprintOf(context);
      const jsInputFingerprint = await jsInputFingerprintOf(context);
      manifest.extensions = {
        device: {
          serial: selected.serial,
          abi,
          emulator,
          apiHost: deviceApi.apiHost,
          apiUrl: deviceApi.apiUrl,
          adbReverse: deviceApi.adbReverse,
          emulatorStartedByRun: Boolean(selected.emulatorPid),
          emulatorPid: selected.emulatorPid,
        },
        nativeBuild: {
          packageName,
          abi,
          versionName: installed.versionName,
          versionCode: installed.versionCode,
          fingerprint,
          configurationFingerprint: configFingerprint,
          sourceFingerprint: source.fingerprint,
          sourceRevision: source.revision,
          nativeInputFingerprint,
          jsInputFingerprint,
          bundleDigest: launchedApp.bundle.digest,
          apiImageId: manifest.resources.api.imageId,
          metro: {
            port: metroPort,
            endpoint: `http://127.0.0.1:${metroPort}`,
            launcherPid,
          },
        },
        evidence: {
          launch: {
            at: new Date().toISOString(),
            outcome: 'launched',
            authenticatedJourneyCertified: false,
            configurationObservedInBundle: true,
            deviceApiReachable: true,
            clerkInstanceCompatible: true,
            clerkFrontendApi,
            certifiesCurrentRevision: true,
            sourceFingerprint: source.fingerprint,
            sourceDirty: source.dirty,
            bundleDigest: launchedApp.bundle.digest,
          },
        },
      };
      manifest.updatedAt = new Date().toISOString();
      await writeManifest(context, manifest);
      addedReverse = false;
      const readiness = {
        apiReady: true,
        authenticationConfigured: true,
        clerkInstanceCompatible: true,
        clerkFrontendApi,
        deviceApiReachable: true,
        deviceApiUrl: deviceApi.apiUrl,
        adbReverse: deviceApi.adbReverse,
        googleAndroidClientIdPresent: Boolean(androidClientId),
        device: { serial: selected.serial, abi, emulator },
        app: { packageName, versionName: installed.versionName, versionCode: installed.versionCode },
        metro: { endpoint: `http://127.0.0.1:${metroPort}`, port: metroPort, launcherPid },
        nativeBuildFingerprint: fingerprint,
        configurationFingerprint: configFingerprint,
        configurationObservedInBundle: true,
        apiImageId: manifest.resources.api.imageId,
        sourceFingerprint: source.fingerprint,
        authenticatedJourneyCertified: false,
      };
      return { exitCode: 0, body: await publicLaunch(context, manifest, 'launch', readiness) };
    } catch (error) {
      if (addedReverse) {
        await adb(context, ['-s', selected.serial, 'reverse', '--remove', `tcp:${manifest.ports.api}`], { allowFailure: true });
      }
      throw error;
    }
  });
}

export async function reloadNative(context, options) {
  return withLaunchOutcome(async () => {
    const publishableKey = context.processEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
    if (!publishableKey) {
      block('missing-configuration', 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in the reload environment. A mobile env file is not the running configuration.');
    }
    decodePublishableKey(publishableKey);
    const packageName = await readAppIdentity(context);
    const source = await sourceIdentity(context);
    const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
    const build = manifest.extensions?.nativeBuild;
    const device = manifest.extensions?.device;
    if (!build?.metro?.port || !device?.serial || !device.apiUrl) {
      block('identity-mismatch', `Run ${manifest.runId} has no recorded native launch to reload.`);
    }
    const androidClientId = context.processEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
    const configFingerprint = configurationFingerprint({
      packageName,
      abi: build.abi,
      apiBaseUrl: device.apiUrl,
      publishableKey,
      androidClientId,
    });
    if (configFingerprint !== build.configurationFingerprint) {
      block('identity-mismatch', `The reload environment does not match the recorded build for ${manifest.runId}.`);
    }
    const listeners = await listenerPids(build.metro.port);
    let owned = false;
    for (const pid of listeners) {
      if (await ownedLauncherPid(pid, manifest.runId)) owned = true;
    }
    if (!owned) block('identity-mismatch', `Metro port ${build.metro.port} is not the Metro server recorded for ${manifest.runId}.`);
    if (!await metroStatus(build.metro.port)) fail('reload-failed', 'The recorded Metro server is not responding.');
    if (!await appRunning(context, device.serial, packageName)) {
      fail('reload-failed', `${packageName} is not running on ${device.serial}. Launch it again through Expo; a deep link was not used.`);
    }
    await reloadSocket(build.metro.port);
    const observed = await bundleContains(build.metro.port, [device.apiUrl, publishableKey], 20_000);
    if (!observed) {
      fail('running-config-mismatch', 'After reload, the Metro bundle does not contain the recorded launch configuration.');
    }
    manifest.extensions.evidence = {
      ...(manifest.extensions.evidence || {}),
      reload: {
        at: new Date().toISOString(),
        outcome: 'reloaded',
        authenticatedJourneyCertified: false,
        configurationObservedInBundle: true,
      },
    };
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(context, manifest);
    const readiness = {
      apiReady: true,
      deviceApiUrl: device.apiUrl,
      device: { serial: device.serial, abi: device.abi, emulator: device.emulator },
      metro: build.metro,
      configurationFingerprint: configFingerprint,
      configurationObservedInBundle: true,
      nativeBuildFingerprint: build.fingerprint,
      authenticatedJourneyCertified: false,
    };
    return { exitCode: 0, body: await publicLaunch(context, manifest, 'reload', readiness) };
  });
}

export async function assertRecordedLaunch(context, manifest, source) {
  const build = manifest.extensions?.nativeBuild;
  const device = manifest.extensions?.device;
  if (!build?.fingerprint || !build.configurationFingerprint || !build.sourceFingerprint || !build.metro?.port || !build.packageName || !device?.serial || !device.apiUrl || !build.abi) {
    block('launch-required', `Run ${manifest.runId} has no recorded native launch. A journey was not started.`);
  }
  if (source.fingerprint !== build.sourceFingerprint) {
    block('identity-mismatch', `The checkout fingerprint does not match the launch recorded for ${manifest.runId}.`);
  }
  const publishableKey = context.processEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
  if (!publishableKey) {
    block('missing-configuration', 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. A mobile env file is not the running configuration.');
  }
  const androidClientId = context.processEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
  const configFingerprint = configurationFingerprint({
    packageName: build.packageName,
    abi: build.abi,
    apiBaseUrl: device.apiUrl,
    publishableKey,
    androidClientId,
  });
  if (configFingerprint !== build.configurationFingerprint) {
    block('identity-mismatch', `The current configuration does not match the launch recorded for ${manifest.runId}.`);
  }
  const ready = (await listDevices(context)).filter((item) => item.state === 'device');
  if (!ready.some((item) => item.serial === device.serial)) {
    block('identity-mismatch', `Recorded device ${device.serial} is not an authorized attached device. Another device was not selected.`);
  }
  const abi = await deviceProperty(context, device.serial, 'ro.product.cpu.abi');
  if (abi !== device.abi || abi !== build.abi) {
    block('identity-mismatch', `Device ${device.serial} ABI does not match the launch recorded for ${manifest.runId}.`);
  }
  const installed = await readInstalledPackage(context, device.serial, build.packageName);
  const currentBuild = installed ? installedFingerprint(configFingerprint, installed) : '';
  if (!installed || currentBuild !== build.fingerprint) {
    block('identity-mismatch', `The installed ${build.packageName} build does not match run ${manifest.runId}.`);
  }
  if (!await appRunning(context, device.serial, build.packageName)) {
    block('launch-required', `${build.packageName} is not running on ${device.serial}. Launch it again before this journey.`);
  }
  const listeners = await listenerPids(build.metro.port);
  let owned = false;
  for (const pid of listeners) {
    if (await ownedLauncherPid(pid, manifest.runId)) owned = true;
  }
  if (!owned) block('identity-mismatch', `Metro port ${build.metro.port} is not the Metro server recorded for ${manifest.runId}.`);
  if (!await metroStatus(build.metro.port)) fail('journey-failed', 'The recorded Metro server is not responding.');
  const observation = await observe(context, manifest);
  if (!observation.api.identityMatches || observation.api.status !== 'running') {
    block('api-unready', `Run ${manifest.runId} has no running owned API.`);
  }
  const imageId = observation.api.imageId || '';
  if (manifest.resources?.api?.imageId && imageId && imageId !== manifest.resources.api.imageId) {
    block('identity-mismatch', `The running API image does not match the image recorded for ${manifest.runId}.`);
  }
  if (build.apiImageId && imageId && imageId !== build.apiImageId) {
    block('identity-mismatch', `The running API image does not match the launch recorded for ${manifest.runId}.`);
  }
  return { build, device, source, apiImageId: imageId || build.apiImageId || manifest.resources?.api?.imageId || '' };
}

const bundleNotActive = 'A reload request alone does not certify the running bundle. Read the run launch.log and run refresh again. Previous source, build, and configuration evidence does not certify this revision.';

async function waitForReloadLog(context, serial, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await adb(context, ['-s', serial, 'logcat', '-d', '-t', '200'], { allowFailure: true });
    if (/Running application|Running ["']/.test(result.stdout)) return true;
    await delay(200);
  }
  return false;
}

async function readDeviceBundle(context, serial, host, port, bundlePath, idle) {
  const script = `: nv-bundle-raw; (printf 'GET ${bundlePath} HTTP/1.0\\r\\nHost: ${host}\\r\\n\\r\\n'; sleep 1) | nc -W ${idle} -w 10 ${host} ${port}`;
  const result = await runProcess(adbBin(context), ['-s', serial, 'exec-out', 'sh', '-c', script], {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
    timeoutMs: (idle + 20) * 1000,
    redactOutput: false,
  });
  if (result.code !== 0) return '';
  return httpBodyDigest(result.stdout);
}

async function deviceBundleDigest(context, serial, port, bundlePath, timeoutMs) {
  const idle = Math.max(5, Math.min(120, Math.ceil(timeoutMs / 1000)));
  const direct = await readDeviceBundle(context, serial, '10.0.2.2', port, bundlePath, idle);
  if (direct) return direct;
  const listed = await reverseListed(context, serial, port);
  let added = false;
  if (!listed) {
    const reversed = await adb(context, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], { allowFailure: true });
    if (reversed.code !== 0) return '';
    added = true;
  }
  try {
    return await readDeviceBundle(context, serial, '127.0.0.1', port, bundlePath, idle);
  } finally {
    if (added) {
      await adb(context, ['-s', serial, 'reverse', '--remove', `tcp:${port}`], { allowFailure: true });
    }
  }
}

async function proveActiveBundle(context, { serial, port, expected, timeoutMs }) {
  await adb(context, ['-s', serial, 'logcat', '-c'], { allowFailure: true });
  await reloadSocket(port);
  const bundle = await fetchBundle(port, expected, timeoutMs);
  if (!bundle) {
    fail('running-config-mismatch', `After refresh, the Metro bundle does not contain the recorded launch configuration. ${bundleNotActive}`);
  }
  const reloaded = await waitForReloadLog(context, serial, timeoutMs);
  if (!reloaded) fail('bundle-not-active', `The emulator did not log a JavaScript reload. ${bundleNotActive}`);
  const observed = await deviceBundleDigest(context, serial, port, bundle.path, timeoutMs);
  if (observed !== bundle.digest) {
    fail('bundle-not-active', `The bundle fetched on the emulator does not match the Metro bundle. ${bundleNotActive}`);
  }
  return bundle;
}

async function dropRevisionCertification(context, manifest) {
  const refresh = manifest.extensions?.evidence?.refresh;
  if (!refresh?.certifiesCurrentRevision) return;
  refresh.certifiesCurrentRevision = false;
  refresh.bundleObservedOnDevice = false;
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(context, manifest);
}

async function failUncertified(context, manifest, code, message) {
  await dropRevisionCertification(context, manifest);
  fail(code, message);
}

export async function coldRestartPreservingState(context, manifest, launch) {
  const publishableKey = context.processEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
  if (!publishableKey) {
    block('missing-configuration', 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. A mobile env file is not the running configuration.');
  }
  const { build, device } = launch;
  const nativeInputFingerprint = await nativeInputFingerprintOf(context);
  const jsInputFingerprint = await jsInputFingerprintOf(context);
  const source = await sourceIdentity(context);
  if (!build.nativeInputFingerprint || !build.jsInputFingerprint
    || build.nativeInputFingerprint !== nativeInputFingerprint
    || build.jsInputFingerprint !== jsInputFingerprint
    || source.fingerprint !== build.sourceFingerprint) {
    await failUncertified(context, manifest, 'revision-not-certified', 'The recorded launch does not match the current source, JavaScript inputs, and native inputs. Run refresh before this journey. Previous evidence does not certify this revision.');
  }
  const timeoutMs = configuredInt(context.processEnv.SPENDEAZY_NV_BUNDLE_TIMEOUT_MS, 180_000, 'SPENDEAZY_NV_BUNDLE_TIMEOUT_MS', 1_800_000);
  const serial = device.serial;
  const packageName = build.packageName;
  const deadline = Date.now() + timeoutMs;
  await adb(context, ['-s', serial, 'logcat', '-c'], { allowFailure: true });
  const stopped = await adb(context, ['-s', serial, 'shell', 'am', 'force-stop', packageName], { allowFailure: true });
  if (stopped.code !== 0) await failUncertified(context, manifest, 'reload-failed', `${packageName} could not be force-stopped. App data was not cleared.`);
  const started = await adb(context, [
    '-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1',
  ], { allowFailure: true, timeoutMs: 30_000 });
  if (started.code !== 0) await failUncertified(context, manifest, 'reload-failed', `${packageName} did not start after the cold restart. App data was not cleared.`);
  let running = false;
  while (Date.now() < deadline) {
    if (await appRunning(context, serial, packageName)) {
      running = true;
      break;
    }
    await delay(200);
  }
  if (!running) await failUncertified(context, manifest, 'reload-failed', `${packageName} was not running after the cold restart. App data was not cleared.`);
  const remaining = () => Math.max(1_000, deadline - Date.now());
  const expected = [device.apiUrl, publishableKey];
  const bundle = await fetchBundle(build.metro.port, expected, remaining());
  if (!bundle) {
    await failUncertified(context, manifest, 'bundle-not-active', `After the cold restart, the Metro bundle does not contain the recorded launch configuration. ${bundleNotActive}`);
  }
  const reloaded = await waitForReloadLog(context, serial, remaining());
  if (!reloaded) await failUncertified(context, manifest, 'bundle-not-active', `The emulator did not log a JavaScript start after the cold restart. ${bundleNotActive}`);
  const observed = await deviceBundleDigest(context, serial, build.metro.port, bundle.path, remaining());
  if (observed !== bundle.digest) {
    await failUncertified(context, manifest, 'bundle-not-active', `The bundle fetched on the emulator after the cold restart does not match Metro. ${bundleNotActive}`);
  }
  const androidClientId = context.processEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
  const configFingerprint = configurationFingerprint({
    packageName,
    abi: build.abi,
    apiBaseUrl: device.apiUrl,
    publishableKey,
    androidClientId,
  });
  const installed = await readInstalledPackage(context, serial, packageName);
  const currentBuild = installed ? installedFingerprint(configFingerprint, installed) : '';
  if (configFingerprint !== build.configurationFingerprint || !installed || currentBuild !== build.fingerprint) {
    await failUncertified(context, manifest, 'identity-mismatch', `The installed ${packageName} build does not match the launch recorded for ${manifest.runId}.`);
  }
  const previousSourceFingerprint = manifest.extensions?.evidence?.refresh?.sourceFingerprint || build.sourceFingerprint || null;
  applyRefreshEvidence(manifest, source, {
    mode: 'cold-restart',
    previousEvidenceCertifiesRevision: previousEvidenceCertifies(manifest, source, {
      nativeChanged: false,
      configChanged: false,
      jsInputFingerprint,
      nativeInputFingerprint,
    }),
    previousSourceFingerprint,
    nativeInputFingerprint,
    jsInputFingerprint,
    bundleDigest: bundle.digest,
    nativeBuildReused: true,
    incompatibleArtifactRejected: false,
    gradleMaxWorkers: gradleMaxWorkers(context),
    abi: build.abi,
    invalidatedBy: null,
    dataCleared: false,
  });
  await writeManifest(context, manifest);
  return { bundleDigest: bundle.digest, packageName, dataCleared: false };
}

async function inspectBuildCache(context, { abi, fingerprint, packageName }) {
  const root = join(context.stateDir, 'build-cache');
  const rejected = [];
  let compatible = null;
  if (!await pathExists(root)) return { compatible, rejected };
  const abiEntries = await readdir(root, { withFileTypes: true });
  for (const abiEntry of abiEntries) {
    if (!abiEntry.isDirectory()) continue;
    const fingerprintEntries = await readdir(join(root, abiEntry.name), { withFileTypes: true });
    for (const fingerprintEntry of fingerprintEntries) {
      if (!fingerprintEntry.isDirectory()) continue;
      const directory = join(root, abiEntry.name, fingerprintEntry.name);
      const artifact = join(directory, 'app.apk');
      if (!await pathExists(artifact)) continue;
      let metadata = {};
      try {
        metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
      } catch {
        metadata = {};
      }
      const matches = metadata.nativeInputFingerprint === fingerprint
        && metadata.abi === abi
        && metadata.packageName === packageName
        && abiEntry.name === abi
        && fingerprintEntry.name === fingerprint;
      if (matches) compatible = { artifact };
      else rejected.push({ abi: abiEntry.name, nativeInputFingerprint: fingerprintEntry.name });
    }
  }
  return { compatible, rejected };
}

const apkAbis = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];

function apkNamesAbi(relative, abi) {
  const text = String(relative).replaceAll('\\', '/');
  if (abi === 'x86') return /(?:^|[/._-])x86(?:[/._-]|$)/.test(text.replaceAll('x86_64', ''));
  return text.includes(abi);
}

function apkNamedAbi(relative) {
  return apkAbis.find((abi) => apkNamesAbi(relative, abi)) || null;
}

async function findBuiltApk(context, abi) {
  const root = join(appRoot(context), 'android', 'app', 'build', 'outputs', 'apk');
  if (!await pathExists(root)) return null;
  const entries = await readdir(root, { recursive: true });
  const found = [];
  for (const entry of entries) {
    const relative = String(entry);
    if (!relative.endsWith('.apk')) continue;
    const absolute = join(root, relative);
    const info = await stat(absolute);
    if (info.isFile()) found.push({ absolute, relative, mtimeMs: info.mtimeMs });
  }
  const named = found.filter((item) => apkNamesAbi(item.relative, abi));
  const unnamed = found.filter((item) => apkNamedAbi(item.relative) === null);
  const pool = named.length > 0 ? named : unnamed;
  pool.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return pool[0]?.absolute || null;
}

async function storeCompatibleApk(context, { abi, fingerprint, packageName }) {
  if (!/^[0-9a-f]{64}$/.test(fingerprint) || !/^(?:armeabi-v7a|arm64-v8a|x86|x86_64)$/.test(abi)) return false;
  const built = await findBuiltApk(context, abi);
  if (!built) return false;
  const directory = join(context.stateDir, 'build-cache', abi, fingerprint);
  await mkdir(directory, { recursive: true });
  await copyFile(built, join(directory, 'app.apk'));
  await writeFile(join(directory, 'metadata.json'), `${JSON.stringify({
    nativeInputFingerprint: fingerprint,
    abi,
    packageName,
    artifactName: 'app.apk',
  }, null, 2)}\n`);
  return true;
}

async function ensureAppRunning(context, serial, packageName) {
  if (await appRunning(context, serial, packageName)) return;
  const started = await adb(context, [
    '-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1',
  ], { allowFailure: true });
  if (started.code !== 0 || !await appRunning(context, serial, packageName)) {
    fail('launch-failed', `${packageName} is not running on ${serial} after the native install. Launch it again through Expo; a deep link was not used.`);
  }
}

async function restartOwnedMetro(context, manifest, { port, config, forceRestart, launcherPid }) {
  const listeners = await listenerPids(port);
  let owned = false;
  for (const pid of listeners) {
    if (await ownedLauncherPid(pid, manifest.runId)) owned = true;
  }
  if (owned && !forceRestart && await metroStatus(port)) return launcherPid;
  if (listeners.length > 0) {
    const report = { removed: { processes: [] }, skipped: [] };
    await stopOwnedMetro(context, manifest, report);
    if (report.skipped.some((entry) => entry.type === 'metro')) {
      block('port-conflict', `Metro port ${port} is still held. The refresh did not replace that process.`);
    }
  }
  if (!await portFree(port)) {
    block('port-conflict', `Metro port ${port} is held by another process. The existing listener was left untouched.`);
  }
  return startOwnedExpo(context, manifest, {
    config,
    expoArgs: ['start', '--dev-client', '--port', String(port)],
    resetLog: false,
  });
}

function applyRefreshEvidence(manifest, source, details) {
  const launchEvidence = manifest.extensions?.evidence?.launch;
  manifest.source = {
    root: source.root,
    revision: source.revision,
    dirty: source.dirty,
    fingerprint: source.fingerprint,
  };
  manifest.extensions.evidence = {
    ...(manifest.extensions.evidence || {}),
    launch: launchEvidence ? { ...launchEvidence, certifiesCurrentRevision: false } : launchEvidence,
    refresh: {
      at: new Date().toISOString(),
      outcome: 'refreshed',
      certifiesCurrentRevision: true,
      authenticatedJourneyCertified: false,
      bundleObservedOnDevice: true,
      configurationObservedInBundle: true,
      ...details,
      sourceFingerprint: source.fingerprint,
      sourceRevision: source.revision,
      sourceDirty: source.dirty,
    },
  };
  manifest.updatedAt = new Date().toISOString();
}

export async function refreshNative(context, options) {
  return withLaunchOutcome(async () => {
    const publishableKey = context.processEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
    if (!publishableKey) {
      block('missing-configuration', 'Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in the refresh environment. A mobile env file is not the running configuration.');
    }
    const frontendApi = decodePublishableKey(publishableKey);
    const androidClientId = context.processEnv.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() || '';
    const packageName = await readAppIdentity(context);
    const source = await sourceIdentity(context);
    const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
    await requireOwnedDatabase(context, manifest);
    const build = manifest.extensions?.nativeBuild;
    const device = manifest.extensions?.device;
    if (!build?.metro?.port || !build.fingerprint || !device?.serial || !device.apiUrl) {
      block('identity-mismatch', `Run ${manifest.runId} has no recorded native launch to refresh.`);
    }
    const selected = await selectDevice(context, { ...options, serial: options.serial || device.serial });
    if (selected.serial !== device.serial) {
      block('identity-mismatch', `Run ${manifest.runId} is recorded on ${device.serial}. ${selected.serial} was not accepted as that device.`);
    }
    const abi = await deviceProperty(context, selected.serial, 'ro.product.cpu.abi');
    if (!abi) block('host-capability', `adb could not read the ABI for ${selected.serial}.`);
    if (options.abi && options.abi !== abi) {
      block('identity-mismatch', `Device ${selected.serial} is ${abi}. The requested ABI was ${options.abi}.`);
    }
    if (build.abi !== abi || device.abi !== abi) {
      block('identity-mismatch', `Run ${manifest.runId} is recorded for ABI ${build.abi}. This device is ${abi}.`);
    }
    const nativeInputFingerprint = await nativeInputFingerprintOf(context);
    const jsInputFingerprint = await jsInputFingerprintOf(context);
    const configFingerprint = configurationFingerprint({
      packageName,
      abi,
      apiBaseUrl: device.apiUrl,
      publishableKey,
      androidClientId,
    });
    const nativeChanged = nativeInputFingerprint !== build.nativeInputFingerprint;
    const configChanged = configFingerprint !== build.configurationFingerprint;
    const previousSourceFingerprint = manifest.extensions?.evidence?.refresh?.sourceFingerprint || build.sourceFingerprint || null;
    const previousEvidenceCertifiesRevision = previousEvidenceCertifies(manifest, source, {
      nativeChanged,
      configChanged,
      jsInputFingerprint,
      nativeInputFingerprint,
    });
    const workers = gradleMaxWorkers(context);
    const bundleTimeout = configuredInt(context.processEnv.SPENDEAZY_NV_BUNDLE_TIMEOUT_MS, 180_000, 'SPENDEAZY_NV_BUNDLE_TIMEOUT_MS', 1_800_000);
    const expected = [device.apiUrl, publishableKey];
    const config = {
      apiBaseUrl: device.apiUrl,
      publishableKey,
      androidClientId,
      abi,
    };

    if (!nativeChanged && !configChanged) {
      const listeners = await listenerPids(build.metro.port);
      let owned = false;
      for (const pid of listeners) {
        if (await ownedLauncherPid(pid, manifest.runId)) owned = true;
      }
      if (!owned) block('identity-mismatch', `Metro port ${build.metro.port} is not the Metro server recorded for ${manifest.runId}.`);
      if (!await metroStatus(build.metro.port)) fail('reload-failed', 'The recorded Metro server is not responding.');
      if (!await appRunning(context, device.serial, packageName)) {
        fail('reload-failed', `${packageName} is not running on ${device.serial}. Launch it again through Expo; a deep link was not used.`);
      }
      const bundle = await proveActiveBundle(context, {
        serial: device.serial,
        port: build.metro.port,
        expected,
        timeoutMs: bundleTimeout,
      });
      manifest.extensions.nativeBuild = {
        ...build,
        sourceFingerprint: source.fingerprint,
        sourceRevision: source.revision,
        jsInputFingerprint,
        bundleDigest: bundle.digest,
        nativeInputFingerprint,
      };
      applyRefreshEvidence(manifest, source, {
        mode: 'javascript-reload',
        previousEvidenceCertifiesRevision,
        previousSourceFingerprint,
        nativeInputFingerprint,
        jsInputFingerprint,
        bundleDigest: bundle.digest,
        nativeBuildReused: false,
        incompatibleArtifactRejected: false,
        gradleMaxWorkers: workers,
        abi,
        invalidatedBy: null,
      });
      await writeManifest(context, manifest);
      return {
        exitCode: 0,
        body: await publicLaunch(context, manifest, 'refresh', {
          mode: 'javascript-reload',
          certifiesCurrentRevision: true,
          previousEvidenceCertifiesRevision,
          previousSourceFingerprint,
          sourceFingerprint: source.fingerprint,
          sourceDirty: source.dirty,
          bundleObservedOnDevice: true,
          configurationObservedInBundle: true,
          bundleDigest: bundle.digest,
          nativeInputFingerprint,
          jsInputFingerprint,
          nativeBuildReused: false,
          incompatibleArtifactRejected: false,
          gradleMaxWorkers: workers,
          abi,
          invalidatedBy: null,
          device: { serial: device.serial, abi, emulator: device.emulator },
          metro: build.metro,
          nativeBuildFingerprint: build.fingerprint,
          authenticatedJourneyCertified: false,
        }, 'refreshed'),
      };
    }

    await preflightHost(context, { requireBuildTools: true });
    const observation = await observe(context, manifest);
    if (!observation.api.identityMatches || observation.api.status !== 'running') {
      block('api-unready', `Run ${manifest.runId} has no running owned API. Start or replace the API before refreshing native inputs.`);
    }
    await hostApiReady(manifest.ports.api);
    const env = await containerEnv(context, observation.api.id);
    await clerkCompatible(context, env, frontendApi);
    const cache = await inspectBuildCache(context, { abi, fingerprint: nativeInputFingerprint, packageName });
    const incompatibleArtifactRejected = cache.rejected.length > 0;
    let installed;
    let launcherPid = build.metro.launcherPid;
    let nativeBuildReused = false;
    if (cache.compatible) {
      const installedApk = await adb(context, ['-s', device.serial, 'install', '-r', cache.compatible.artifact], {
        allowFailure: true,
        timeoutMs: 180_000,
      });
      if (installedApk.code !== 0) {
        fail('launch-failed', `The compatible cached build could not be installed on ${device.serial}. ${bundleNotActive}`);
      }
      nativeBuildReused = true;
      installed = await readInstalledPackage(context, device.serial, packageName);
      if (!installed) fail('launch-failed', `The cached build did not leave ${packageName} installed on ${device.serial}.`);
      await ensureAppRunning(context, device.serial, packageName);
      launcherPid = await restartOwnedMetro(context, manifest, {
        port: build.metro.port,
        config,
        forceRestart: configChanged,
        launcherPid,
      });
      const ready = await fetchBundle(build.metro.port, expected, bundleTimeout);
      if (!ready) {
        fail('running-config-mismatch', `After installing the cached build, the Metro bundle does not contain the launch configuration. ${bundleNotActive}`);
      }
    } else {
      if ((await listenerPids(build.metro.port)).length > 0) {
        const report = { removed: { processes: [] }, skipped: [] };
        await stopOwnedMetro(context, manifest, report);
        if (report.skipped.some((entry) => entry.type === 'metro')) {
          block('port-conflict', `Metro port ${build.metro.port} is still held. The refresh did not start a second Metro server.`);
        }
      }
      if (!await portFree(build.metro.port)) {
        block('port-conflict', `Metro port ${build.metro.port} is held by another process. The existing listener was left untouched.`);
      }
      launcherPid = await startOwnedExpo(context, manifest, {
        config,
        expoArgs: ['run:android', '--device', device.serial, '--port', String(build.metro.port)],
        resetLog: false,
      });
      const launchedApp = await waitForLaunch(context, {
        manifest,
        serial: device.serial,
        packageName,
        port: build.metro.port,
        expected,
        launcherPid,
      });
      installed = launchedApp.installed;
    }
    if (installed.primaryCpuAbi !== abi) {
      fail('launch-failed', `The installed build is ${installed.primaryCpuAbi}. The selected emulator ABI is ${abi}. That artifact was not certified.`);
    }
    const bundle = await proveActiveBundle(context, {
      serial: device.serial,
      port: build.metro.port,
      expected,
      timeoutMs: bundleTimeout,
    });
    if (!nativeBuildReused) {
      await storeCompatibleApk(context, { abi, fingerprint: nativeInputFingerprint, packageName });
    }
    const fingerprint = installedFingerprint(configFingerprint, installed);
    manifest.extensions.nativeBuild = {
      ...build,
      abi,
      versionName: installed.versionName,
      versionCode: installed.versionCode,
      fingerprint,
      configurationFingerprint: configFingerprint,
      sourceFingerprint: source.fingerprint,
      sourceRevision: source.revision,
      nativeInputFingerprint,
      jsInputFingerprint,
      bundleDigest: bundle.digest,
      metro: {
        ...build.metro,
        launcherPid,
      },
    };
    manifest.extensions.device = { ...device, abi };
    applyRefreshEvidence(manifest, source, {
      mode: 'native-rebuild',
      previousEvidenceCertifiesRevision,
      previousSourceFingerprint,
      nativeInputFingerprint,
      jsInputFingerprint,
      bundleDigest: bundle.digest,
      nativeBuildReused,
      incompatibleArtifactRejected,
      gradleMaxWorkers: workers,
      abi,
      invalidatedBy: nativeChanged ? 'native-inputs' : 'configuration',
      nativeBuildFingerprint: fingerprint,
    });
    await writeManifest(context, manifest);
    return {
      exitCode: 0,
      body: await publicLaunch(context, manifest, 'refresh', {
        mode: 'native-rebuild',
        certifiesCurrentRevision: true,
        previousEvidenceCertifiesRevision,
        previousSourceFingerprint,
        sourceFingerprint: source.fingerprint,
        sourceDirty: source.dirty,
        bundleObservedOnDevice: true,
        configurationObservedInBundle: true,
        bundleDigest: bundle.digest,
        nativeInputFingerprint,
        jsInputFingerprint,
        nativeBuildReused,
        incompatibleArtifactRejected,
        gradleMaxWorkers: workers,
        abi,
        invalidatedBy: nativeChanged ? 'native-inputs' : 'configuration',
        device: { serial: device.serial, abi, emulator: device.emulator },
        metro: manifest.extensions.nativeBuild.metro,
        nativeBuildFingerprint: fingerprint,
        authenticatedJourneyCertified: false,
      }, 'refreshed'),
    };
  });
}
