import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = resolve(repoRoot, 'local-test', 'native-verification.compose.yml');
const dockerfile = resolve(repoRoot, 'api', 'Dockerfile');
const apiContext = resolve(repoRoot, 'api');
const runIdPattern = /^nv-[0-9a-f]{12}$/;
const labelPrefix = 'io.spendeazy.native-verification';
const emptyExtensions = { device: null, nativeBuild: null, evidence: null };

export class VerificationError extends Error {
  constructor(code, message, outcome = null) {
    super(message);
    this.code = code;
    this.outcome = outcome;
    this.statement = outcome ? 'Launch alone does not certify an authenticated journey.' : null;
  }
}

export function parseArguments(args) {
  const options = {
    help: false,
    operation: null,
    runId: null,
    fresh: false,
    apiPort: null,
    databasePort: null,
    stateDir: null,
    serial: null,
    abi: null,
    metroPort: null,
    deviceApiHost: null,
    bootAvd: null,
  };
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--new') {
      options.fresh = true;
      continue;
    }
    const valueOptions = {
      '--run': 'runId',
      '--api-port': 'apiPort',
      '--database-port': 'databasePort',
      '--state-dir': 'stateDir',
      '--serial': 'serial',
      '--abi': 'abi',
      '--metro-port': 'metroPort',
      '--device-api-host': 'deviceApiHost',
      '--boot-avd': 'bootAvd',
    };
    const field = valueOptions[arg];
    if (field) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new VerificationError('usage', `Missing value for ${arg}.`);
      }
      options[field] = field.endsWith('Port') ? parsePort(value, arg) : value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new VerificationError('usage', `Unknown option ${arg}.`);
    }
    positionals.push(arg);
  }
  if (options.help && positionals.length === 0) return options;
  if (positionals.length !== 1) {
    throw new VerificationError('usage', 'Specify one operation: start, attach, status, stop, replace-api, launch, reload, or refresh.');
  }
  const operation = positionals[0];
  if (!['start', 'attach', 'status', 'stop', 'replace-api', 'launch', 'reload', 'refresh'].includes(operation)) {
    throw new VerificationError('usage', `Unknown operation ${operation}.`);
  }
  if (options.fresh && operation !== 'start') {
    throw new VerificationError('usage', '--new applies only to start.');
  }
  if (options.fresh && options.runId) {
    throw new VerificationError('usage', 'Use either --new or --run.');
  }
  if (options.runId && !runIdPattern.test(options.runId)) {
    throw new VerificationError('usage', 'Run identity must look like nv-0123456789ab.');
  }
  if (!['launch', 'refresh'].includes(operation) && (options.serial || options.abi || options.metroPort || options.deviceApiHost || options.bootAvd)) {
    throw new VerificationError('usage', 'Device and Metro options apply only to launch and refresh.');
  }
  if (operation === 'refresh' && (options.metroPort || options.deviceApiHost)) {
    throw new VerificationError('usage', '--metro-port and --device-api-host apply only to launch. refresh keeps the recorded Metro server and device API address.');
  }
  if (options.serial && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.serial)) {
    throw new VerificationError('usage', '--serial contains unsupported characters.');
  }
  if (options.abi && !/^(?:armeabi-v7a|arm64-v8a|x86|x86_64)$/.test(options.abi)) {
    throw new VerificationError('usage', '--abi must be armeabi-v7a, arm64-v8a, x86, or x86_64.');
  }
  if (options.deviceApiHost && !isDeviceHost(options.deviceApiHost)) {
    throw new VerificationError('usage', '--device-api-host must be a hostname or IPv4 address.');
  }
  if (options.bootAvd && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.bootAvd)) {
    throw new VerificationError('usage', '--boot-avd contains unsupported characters.');
  }
  options.operation = operation;
  return options;
}

function isDeviceHost(value) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split('.').every((octet) => Number(octet) <= 255);
  }
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/.test(value);
}

function parsePort(value, flag) {
  if (!/^\d+$/.test(value)) {
    throw new VerificationError('usage', `${flag} must be an integer from 1 to 65535.`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new VerificationError('usage', `${flag} must be an integer from 1 to 65535.`);
  }
  return port;
}

export function defaultStateDirectory(env = process.env, platform = process.platform) {
  if (env.SPENDEAZY_NATIVE_VERIFICATION_STATE) return env.SPENDEAZY_NATIVE_VERIFICATION_STATE;
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'spendeazy', 'native-verification');
  }
  return join(homedir(), '.spendeazy', 'native-verification');
}

export function helpText() {
  return `Usage: node scripts/native-verification.mjs <operation> [options]

Operations:
  start         Create or reuse one owned API and database
  attach        Check that a compatible owned run is live
  status        Inspect a run without changing it
  stop          Remove only verified owned resources
  replace-api   Rebuild and replace the API, keeping its database
  launch        Install and launch the native build against that API
  reload        Reload the launched app through the owned Metro server
  refresh       Reload JavaScript or rebuild native inputs, with bundle evidence

Options:
  --run <id>            Select a run (nv- plus 12 hex characters)
  --new                 With start, create another run
  --api-port <port>     Bind the API on 127.0.0.1
  --database-port <port>
  --serial <serial>     With launch or refresh, select one attached Android device
  --abi <abi>           With launch or refresh, require armeabi-v7a, arm64-v8a, x86, or x86_64
  --metro-port <port>   With launch, Metro port (default 8081, or SPENDEAZY_NV_METRO_PORT)
  --device-api-host <host>
                        With launch, device-reachable API host
  --boot-avd <name>     With launch or refresh, start this AVD when no device is attached
  --state-dir <path>    Manifest and run-scoped configuration directory
  --help

Windows host, from the repository root in PowerShell:
  node .\\scripts\\native-verification.mjs start
  node .\\scripts\\native-verification.mjs status
  node .\\scripts\\native-verification.mjs attach
  node .\\scripts\\native-verification.mjs replace-api
  node .\\scripts\\native-verification.mjs launch
  node .\\scripts\\native-verification.mjs reload
  node .\\scripts\\native-verification.mjs refresh
  node .\\scripts\\native-verification.mjs stop

Prerequisites on Windows: Node.js 24, Git, and Docker Desktop with the Linux
containers engine running. Launch also needs an Android SDK
(ANDROID_HOME, ANDROID_SDK_ROOT, or SPENDEAZY_NV_ANDROID_SDK), adb
(SPENDEAZY_NV_ADB), and a JDK (java or SPENDEAZY_NV_JAVA). The default state
directory is %LOCALAPPDATA%\\spendeazy\\native-verification. On Linux and
macOS it is ~/.spendeazy/native-verification. The command does not modify
api/.env, the personal api.env file, or mobile env files. A busy selected
port is an error. Process ids and ports are not ownership proof. Launch
alone does not certify an authenticated journey.
`;
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (process.platform === 'win32') return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  return normalizedLeft === normalizedRight;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function encodeEnv(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${String(value).replaceAll('\n', '\\n')}`).join('\n')}\n`;
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

function credentialValues(secrets) {
  return [...secrets].filter((value) => typeof value === 'string' && value.length >= 8);
}

export function redact(text, secrets) {
  let redacted = text;
  for (const secret of credentialValues(secrets)) {
    redacted = redacted.split(secret).join('[redacted]');
    const digest = createHash('sha256').update(secret).digest('hex');
    const digest64 = createHash('sha256').update(secret).digest('base64');
    redacted = redacted.split(digest).join('[redacted]');
    redacted = redacted.split(digest64).join('[redacted]');
  }
  return redacted;
}

function assertNoCredentials(label, text, secrets) {
  for (const secret of credentialValues(secrets)) {
    if (text.includes(secret)) throw new VerificationError('credential-exposure', `${label} included a credential.`);
    const digest = createHash('sha256').update(secret).digest('hex');
    const digest64 = createHash('sha256').update(secret).digest('base64');
    if (text.includes(digest) || text.includes(digest64)) {
      throw new VerificationError('credential-exposure', `${label} included a secret hash.`);
    }
  }
}

function singleLine(value) {
  return String(value).replaceAll('\r\n', '\n').replaceAll('\n', '\\n');
}

export function rememberCredential(secrets, value) {
  if (typeof value !== 'string' || value.length < 8) return;
  secrets.add(value);
  const encoded = singleLine(value);
  if (encoded !== value) secrets.add(encoded);
}

export function tail(text, lines = 30) {
  return text.trim().split(/\r?\n/).slice(-lines).join('\n');
}

export function runProcess(command, args, { cwd, env, secrets, echoStderr = false, input = null, timeoutMs = 0, redactOutput = true } = {}) {
  return new Promise((resolveRun) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveRun(result);
    };
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (input !== null) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    const stdout = [];
    const stderr = [];
    const protect = (text) => redactOutput ? redact(text, secrets) : text;
    child.stdout.on('data', (chunk) => stdout.push(protect(chunk.toString('utf8'))));
    child.stderr.on('data', (chunk) => {
      const text = protect(chunk.toString('utf8'));
      stderr.push(text);
      if (echoStderr) process.stderr.write(text);
    });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish({
          code: 124,
          stdout: stdout.join(''),
          stderr: `${stderr.join('')}\nThe command timed out.`,
          missing: false,
          timedOut: true,
        });
      }, timeoutMs);
    }
    child.once('error', (error) => {
      finish({ code: 127, stdout: '', stderr: redact(error.message, secrets), missing: error.code === 'ENOENT', timedOut: false });
    });
    child.once('close', (code) => {
      finish({ code: code ?? 1, stdout: stdout.join(''), stderr: stderr.join(''), missing: false, timedOut: false });
    });
  });
}

export async function docker(args, context, { allowFailure = false, echoStderr = false, env, redactOutput = true } = {}) {
  const result = await runProcess(context.processEnv.SPENDEAZY_NV_DOCKER || 'docker', args, {
    redactOutput,
    cwd: context.repoRoot,
    env: env ?? context.processEnv,
    secrets: context.secrets,
    echoStderr,
  });
  if (result.missing) {
    throw new VerificationError('docker-unavailable', 'Docker is not available. On Windows, start Docker Desktop and switch it to Linux containers.');
  }
  if (result.code !== 0 && !allowFailure) {
    throw new VerificationError('docker-failed', `docker ${args[0]} failed.\n${tail(result.stderr || result.stdout)}`);
  }
  return result;
}

function label(name) {
  return `${labelPrefix}/${name}`;
}

function composeEnvironment(processEnv, manifest, secretsEnv, runtimeEnvFile) {
  const env = { ...processEnv };
  delete env.CLERK_JWT_KEY;
  delete env.CLERK_SECRET_KEY;
  return {
    ...env,
    SPENDEAZY_NV_RUN_ID: manifest.runId,
    SPENDEAZY_NV_OWNERSHIP_TOKEN: manifest.ownershipToken,
    SPENDEAZY_NV_PROJECT: manifest.resources.composeProject,
    SPENDEAZY_NV_DB_NAME: manifest.resources.database.databaseName,
    SPENDEAZY_NV_DB_USER: manifest.resources.database.user,
    SPENDEAZY_NV_DB_PASSWORD: secretsEnv.SPENDEAZY_NV_DB_PASSWORD,
    SPENDEAZY_NV_DB_PORT: String(manifest.ports.database),
    SPENDEAZY_NV_API_PORT: String(manifest.ports.api),
    SPENDEAZY_NV_API_IMAGE: manifest.resources.api.imageTag,
    SPENDEAZY_NV_INVITE_KEY: secretsEnv.SPENDEAZY_NV_INVITE_KEY,
    SPENDEAZY_NV_REFERENCE_KEY: secretsEnv.SPENDEAZY_NV_REFERENCE_KEY,
    SPENDEAZY_NV_RUNTIME_ENV_FILE: runtimeEnvFile,
  };
}

async function ensureComposeEnvFile(context, runId) {
  const path = join(runDirectory(context, runId), 'compose.env');
  try {
    await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(runDirectory(context, runId), { recursive: true });
    await writeFile(path, '');
  }
  return path;
}

function clerkJwtForRuntime(value) {
  let encoded = singleLine(value);
  while (encoded.endsWith('\\n')) encoded = encoded.slice(0, -2);
  return encoded;
}

async function writeRuntimeEnv(context, runId, secretsEnv) {
  const lines = [];
  if (secretsEnv.CLERK_JWT_KEY) {
    const encoded = clerkJwtForRuntime(secretsEnv.CLERK_JWT_KEY);
    rememberCredential(context.secrets, encoded);
    lines.push(`CLERK_JWT_KEY=${encoded}`);
  }
  if (secretsEnv.CLERK_SECRET_KEY) lines.push(`CLERK_SECRET_KEY=${singleLine(secretsEnv.CLERK_SECRET_KEY)}`);
  const path = join(runDirectory(context, runId), 'runtime.env');
  await mkdir(runDirectory(context, runId), { recursive: true });
  await writeFile(path, `${lines.join('\n')}${lines.length ? '\n' : ''}`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function compose(manifest, args, context, secretsEnv, { allowFailure = false } = {}) {
  const envFile = await ensureComposeEnvFile(context, manifest.runId);
  const runtimeEnvFile = await writeRuntimeEnv(context, manifest.runId, secretsEnv);
  const result = await docker([
    'compose',
    '--env-file', envFile,
    '--project-name', manifest.resources.composeProject,
    '--project-directory', runDirectory(context, manifest.runId),
    '--file', composeFile,
    ...args,
  ], context, { allowFailure, env: composeEnvironment(context.processEnv, manifest, secretsEnv, resolve(runtimeEnvFile)) });
  if (/address already in use|port is already allocated|Bind for 127\.0\.0\.1/i.test(result.stderr)) {
    throw new VerificationError('port-conflict', 'A selected port became busy. The owned database was left in place when it already existed.');
  }
  return result;
}

function runDirectory(context, runId) {
  return join(context.stateDir, 'runs', runId);
}

function manifestPath(context, runId) {
  return join(runDirectory(context, runId), 'manifest.json');
}

function secretsPath(context, runId) {
  return join(runDirectory(context, runId), 'secrets.env');
}

export async function writeManifest(context, manifest) {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  assertNoCredentials('manifest', text, context.secrets);
  const directory = runDirectory(context, manifest.runId);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, 'manifest.json.tmp');
  await writeFile(temporary, text);
  await rm(manifestPath(context, manifest.runId), { force: true });
  await writeFile(manifestPath(context, manifest.runId), text);
  await rm(temporary, { force: true });
}

async function writeSecrets(context, runId, values) {
  const directory = runDirectory(context, runId);
  await mkdir(directory, { recursive: true });
  const path = secretsPath(context, runId);
  await writeFile(path, encodeEnv(values), { mode: 0o600 });
  await chmod(path, 0o600);
}

async function readSecrets(context, runId) {
  const values = decodeEnv(await readFile(secretsPath(context, runId), 'utf8'));
  for (const value of Object.values(values)) rememberCredential(context.secrets, value);
  return values;
}

async function rememberStoredSecrets(context, runId) {
  try {
    await readSecrets(context, runId);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function readManifest(context, runId) {
  try {
    return JSON.parse(await readFile(manifestPath(context, runId), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new VerificationError('invalid-manifest', `The manifest for ${runId} could not be read.`);
  }
}

async function listManifests(context) {
  const runsDirectory = join(context.stateDir, 'runs');
  let names = [];
  try {
    names = await readdir(runsDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const manifests = [];
  for (const name of names) {
    if (!runIdPattern.test(name)) continue;
    const manifest = await readManifest(context, name);
    if (manifest) manifests.push(manifest);
  }
  return manifests;
}

async function git(context, args) {
  const result = await runProcess('git', ['-C', context.repoRoot, ...args], {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
  });
  if (result.code !== 0) {
    throw new VerificationError('source-identity-unavailable', 'Git could not identify this checkout.');
  }
  return result.stdout;
}

export async function sourceIdentity(context) {
  const root = await realpath((await git(context, ['rev-parse', '--show-toplevel'])).trim());
  const revision = (await git(context, ['rev-parse', 'HEAD'])).trim();
  const porcelainResult = await runProcess('git', ['-C', context.repoRoot, 'status', '--porcelain=v1', '-z'], {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
  });
  if (porcelainResult.code !== 0) {
    throw new VerificationError('source-identity-unavailable', 'Git could not describe the checkout.');
  }
  const porcelain = porcelainResult.stdout;
  const fingerprint = createHash('sha256').update(revision).update('\0').update(porcelain).digest('hex');
  return { root, revision, dirty: porcelain.length > 0, fingerprint };
}

async function runtimeIdentity(context) {
  const dockerVersion = await docker(['version', '--format', '{{.Server.Version}}'], context);
  const composeVersion = await docker(['compose', 'version', '--short'], context);
  return {
    platform: process.platform,
    node: process.version,
    docker: dockerVersion.stdout.trim(),
    compose: composeVersion.stdout.trim(),
  };
}

async function requireDocker(context) {
  const info = await docker(['info'], context, { allowFailure: true });
  if (info.missing || info.code !== 0) {
    throw new VerificationError('docker-unavailable', 'Docker is not available. On Windows, start Docker Desktop and switch it to Linux containers.');
  }
  await runtimeIdentity(context);
}

function blankLabel(value) {
  return !value || value === '<no value>';
}

function parseInspect(stdout) {
  const [id, status, pid, startedAt, imageId, image, name, runId, token, role] = stdout.trim().split('|');
  if (!id) return null;
  return {
    id,
    status,
    pid: Number(pid),
    startedAt,
    imageId,
    image,
    name,
    runId: blankLabel(runId) ? '' : runId,
    token: blankLabel(token) ? '' : token,
    role: blankLabel(role) ? '' : role,
  };
}

async function inspectContainer(context, containerId) {
  if (!containerId) return null;
  const result = await docker([
    'inspect',
    '--type', 'container',
    '--format',
    '{{.Id}}|{{.State.Status}}|{{.State.Pid}}|{{.State.StartedAt}}|{{.Image}}|{{.Config.Image}}|{{.Name}}|{{index .Config.Labels "io.spendeazy.native-verification/run-id"}}|{{index .Config.Labels "io.spendeazy.native-verification/ownership-token"}}|{{index .Config.Labels "io.spendeazy.native-verification/role"}}',
    containerId,
  ], context, { allowFailure: true });
  if (result.code !== 0) return null;
  return parseInspect(result.stdout);
}

async function findContainerIds(context, manifest, role) {
  const result = await docker([
    'ps', '-aq',
    '--filter', `label=${label('run-id')}=${manifest.runId}`,
    '--filter', `label=${label('ownership-token')}=${manifest.ownershipToken}`,
    '--filter', `label=${label('role')}=${role}`,
  ], context);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function labelsMatch(info, manifest, role) {
  return Boolean(info) && info.runId === manifest.runId && info.token === manifest.ownershipToken && info.role === role;
}

function observedContainer(info, identityMatches) {
  return {
    present: true,
    identityMatches,
    status: info.status,
    pid: info.pid,
    startedAt: info.startedAt,
    id: info.id,
    name: info.name,
    imageId: info.imageId,
    image: info.image,
  };
}

async function observeRole(context, manifest, role) {
  const recordedId = manifest.resources?.[role]?.containerId ?? null;
  const recordedInfo = recordedId ? await inspectContainer(context, recordedId) : null;
  if (recordedInfo && labelsMatch(recordedInfo, manifest, role) && recordedInfo.id === recordedId) {
    return observedContainer(recordedInfo, true);
  }
  const ids = await findContainerIds(context, manifest, role);
  if (ids.length === 1) {
    const info = await inspectContainer(context, ids[0]);
    if (info && labelsMatch(info, manifest, role)) return observedContainer(info, true);
  }
  if (ids.length > 1) {
    return { present: true, identityMatches: false, status: 'ambiguous', pid: null, startedAt: null, id: null };
  }
  if (recordedInfo) return observedContainer(recordedInfo, false);
  return { present: false, identityMatches: false, status: 'missing', pid: null, startedAt: null, id: null };
}

async function observeVolume(context, manifest) {
  const name = manifest.resources?.database?.volumeName;
  if (!name) return { present: false, identityMatches: false };
  const result = await docker([
    'volume', 'inspect',
    '--format', '{{.Name}}|{{index .Labels "io.spendeazy.native-verification/run-id"}}|{{index .Labels "io.spendeazy.native-verification/ownership-token"}}|{{index .Labels "io.spendeazy.native-verification/role"}}',
    name,
  ], context, { allowFailure: true });
  if (result.code !== 0) return { present: false, identityMatches: false, name };
  const [volumeName, runId, token, role] = result.stdout.trim().split('|');
  const identityMatches = volumeName === name && runId === manifest.runId && token === manifest.ownershipToken && role === 'database';
  return { present: true, identityMatches, name };
}

async function observeNetwork(context, manifest) {
  const name = manifest.resources?.database?.networkName;
  if (!name) return { present: false, identityMatches: false };
  const result = await docker([
    'network', 'inspect',
    '--format', '{{.Name}}|{{index .Labels "io.spendeazy.native-verification/run-id"}}|{{index .Labels "io.spendeazy.native-verification/ownership-token"}}|{{index .Labels "io.spendeazy.native-verification/role"}}',
    name,
  ], context, { allowFailure: true });
  if (result.code !== 0) return { present: false, identityMatches: false, name };
  const [networkName, runId, token, role] = result.stdout.trim().split('|');
  const identityMatches = networkName === name && runId === manifest.runId && token === manifest.ownershipToken && role === 'network';
  return { present: true, identityMatches, name };
}

export async function observe(context, manifest) {
  const [database, api, volume, network] = await Promise.all([
    observeRole(context, manifest, 'database'),
    observeRole(context, manifest, 'api'),
    observeVolume(context, manifest),
    observeNetwork(context, manifest),
  ]);
  return { database, api, volume, network };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listRelativeFiles(root, directory) {
  const absolute = join(root, directory);
  if (!await fileExists(absolute)) return [];
  let entries = [];
  try {
    entries = await readdir(absolute, { recursive: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relative = join(directory, String(entry)).replaceAll('\\', '/');
    if (relative.includes('/build/') || relative.includes('/.gradle/') || relative.endsWith('.apk')) continue;
    const info = await stat(join(root, relative));
    if (info.isFile()) files.push(relative);
  }
  return files;
}

async function hashFiles(root, files) {
  const hash = createHash('sha256');
  const sorted = [...files].sort();
  for (const relative of sorted) {
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(join(root, relative)));
    hash.update('\0');
  }
  hash.update(String(sorted.length));
  return hash.digest('hex');
}

export async function nativeInputFingerprintOf(context) {
  const root = join(context.repoRoot, 'mobile-app');
  const present = [];
  for (const relative of ['package.json', 'package-lock.json', 'app.json', 'app.config.ts', 'app.config.js', 'eas.json']) {
    if (await fileExists(join(root, relative))) present.push(relative);
  }
  for (const directory of ['plugins', 'modules', 'assets', 'android', 'ios']) {
    present.push(...await listRelativeFiles(root, directory));
  }
  return hashFiles(root, present);
}

export async function jsInputFingerprintOf(context) {
  const root = join(context.repoRoot, 'mobile-app');
  const files = (await listRelativeFiles(root, 'src')).filter((file) => /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(file));
  for (const relative of ['babel.config.js', 'metro.config.js', 'tsconfig.json']) {
    if (await fileExists(join(root, relative))) files.push(relative);
  }
  return hashFiles(root, files);
}

function revisionCertified(manifest, source, javascriptInputs, nativeInputs) {
  const refresh = manifest.extensions?.evidence?.refresh;
  const launchEvidence = manifest.extensions?.evidence?.launch;
  if (refresh) {
    return refresh.certifiesCurrentRevision === true
      && refresh.sourceFingerprint === source.fingerprint
      && refresh.nativeInputFingerprint === nativeInputs
      && refresh.jsInputFingerprint === javascriptInputs;
  }
  const build = manifest.extensions?.nativeBuild;
  return launchEvidence?.certifiesCurrentRevision === true
    && build?.sourceFingerprint === source.fingerprint
    && build?.nativeInputFingerprint === nativeInputs
    && build?.jsInputFingerprint === javascriptInputs;
}

function lifecycleFor(observation) {
  if (observation.database.identityMatches && observation.database.status === 'running') {
    if (observation.api.identityMatches && observation.api.status === 'running') return 'running';
    return 'api-stopped';
  }
  return 'stale';
}

function compatibleWith(manifest, source, observation) {
  return manifest.schemaVersion === 1
    && samePath(manifest.source?.root, source.root)
    && observation.database.identityMatches
    && observation.database.status === 'running';
}

export async function publicBody(context, manifest, { operation, reused = false, extra = {} }) {
  await rememberStoredSecrets(context, manifest.runId);
  const source = await sourceIdentity(context);
  const observation = await observe(context, manifest);
  const javascriptInputs = await jsInputFingerprintOf(context);
  const nativeInputs = await nativeInputFingerprintOf(context);
  const lifecycle = lifecycleFor(observation);
  return {
    ok: true,
    operation,
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    reused,
    compatible: compatibleWith(manifest, source, observation),
    lifecycle,
    ownershipVerified: observation.database.identityMatches,
    phase: manifest.phase,
    ports: manifest.ports,
    source: {
      root: manifest.source.root,
      revision: manifest.source.revision,
      dirty: manifest.source.dirty,
      fingerprint: manifest.source.fingerprint,
      current: {
        revision: source.revision,
        dirty: source.dirty,
        fingerprint: source.fingerprint,
      },
    },
    runtime: manifest.runtime,
    resources: {
      composeProject: manifest.resources.composeProject,
      database: {
        containerId: observation.database.identityMatches ? observation.database.id : null,
        recordedContainerId: manifest.resources.database.containerId,
        volumeName: manifest.resources.database.volumeName,
        networkName: manifest.resources.database.networkName,
        image: manifest.resources.database.image,
        databaseName: manifest.resources.database.databaseName,
        user: manifest.resources.database.user,
        observed: {
          present: observation.database.present,
          identityMatches: observation.database.identityMatches,
          status: observation.database.status,
          pid: observation.database.identityMatches ? observation.database.pid : null,
          startedAt: observation.database.identityMatches ? observation.database.startedAt : null,
        },
      },
      api: {
        containerId: observation.api.identityMatches ? observation.api.id : null,
        recordedContainerId: manifest.resources.api.containerId,
        imageTag: manifest.resources.api.imageTag,
        imageId: manifest.resources.api.imageId,
        observed: {
          present: observation.api.present,
          identityMatches: observation.api.identityMatches,
          status: observation.api.status,
          pid: observation.api.identityMatches ? observation.api.pid : null,
          startedAt: observation.api.identityMatches ? observation.api.startedAt : null,
        },
      },
    },
    extensions: manifest.extensions ?? emptyExtensions,
    javascriptInputs,
    nativeInputs,
    revisionCertified: revisionCertified(manifest, source, javascriptInputs, nativeInputs),
    ...extra,
  };
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
    throw new VerificationError('port-allocation-failed', 'Could not allocate a loopback port.');
  }
  const { port } = address;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function assertPortAvailable(port, labelName) {
  const server = createServer();
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolveListen);
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new VerificationError('port-conflict', `${labelName} port ${port} is already in use. The command left that listener untouched.`);
    }
    throw error;
  }
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

async function allocatePorts(options) {
  const apiPort = options.apiPort ?? await findAvailablePort();
  if (options.apiPort) await assertPortAvailable(options.apiPort, 'API');
  let databasePort = options.databasePort ?? await findAvailablePort();
  if (options.databasePort) await assertPortAvailable(options.databasePort, 'Database');
  if (databasePort === apiPort) databasePort = await findAvailablePort();
  if (databasePort === apiPort) {
    throw new VerificationError('port-conflict', 'The API and database ports must be different.');
  }
  return { api: apiPort, database: databasePort };
}

async function selectableRuns(context, source) {
  const manifests = await listManifests(context);
  const reusable = [];
  for (const manifest of manifests) {
    if (manifest.schemaVersion !== 1 || !samePath(manifest.source?.root, source.root)) continue;
    const observation = await observe(context, manifest);
    if (compatibleWith(manifest, source, observation)) reusable.push(manifest);
  }
  return reusable;
}

export async function resolveSelected(context, options, source, { requireCompatible }) {
  if (options.runId) {
    const manifest = await readManifest(context, options.runId);
    if (!manifest) throw new VerificationError('run-not-found', `No manifest exists for ${options.runId}.`);
    if (requireCompatible && !samePath(manifest.source?.root, source.root)) {
      throw new VerificationError('incompatible-run', `Run ${options.runId} belongs to a different checkout and was left untouched.`);
    }
    if (requireCompatible && manifest.schemaVersion !== 1) {
      throw new VerificationError('incompatible-run', `Run ${options.runId} uses an unsupported manifest schema and was left untouched.`);
    }
    return manifest;
  }
  const reusable = await selectableRuns(context, source);
  if (reusable.length === 1) return reusable[0];
  if (reusable.length === 0) {
    throw new VerificationError('no-run', 'No compatible owned run is live for this checkout.');
  }
  throw new VerificationError('multiple-runs', `Several owned runs are live: ${reusable.map((manifest) => manifest.runId).join(', ')}. Pass --run.`);
}

export async function requireOwnedDatabase(context, manifest) {
  const observation = await observe(context, manifest);
  if (!observation.database.identityMatches || observation.database.status !== 'running') {
    throw new VerificationError('stale-run', `Run ${manifest.runId} has no live owned database. Recorded ports or process ids were not reused.`);
  }
  if (observation.api.present && !observation.api.identityMatches) {
    throw new VerificationError('ownership-mismatch', `Run ${manifest.runId} records an API container that failed the ownership check. It was left untouched.`);
  }
  return observation;
}

function forwardedClerk(env) {
  const values = {};
  if (env.CLERK_JWT_KEY) values.CLERK_JWT_KEY = singleLine(env.CLERK_JWT_KEY);
  if (env.CLERK_SECRET_KEY) values.CLERK_SECRET_KEY = singleLine(env.CLERK_SECRET_KEY);
  return values;
}

async function buildApi(context, manifest) {
  process.stderr.write(`Building API image ${manifest.resources.api.imageTag}.\n`);
  await docker([
    'build',
    '--file', dockerfile,
    '--tag', manifest.resources.api.imageTag,
    '--label', `${label('run-id')}=${manifest.runId}`,
    '--label', `${label('ownership-token')}=${manifest.ownershipToken}`,
    '--label', `${label('role')}=api-image`,
    apiContext,
  ], context, { echoStderr: true });
  const inspected = await docker(['image', 'inspect', '--format', '{{.Id}}', manifest.resources.api.imageTag], context);
  manifest.resources.api.imageId = inspected.stdout.trim();
}

async function recordIdentities(context, manifest) {
  const observation = await observe(context, manifest);
  if (observation.database.identityMatches) {
    manifest.resources.database.containerId = observation.database.id;
    manifest.resources.database.pid = observation.database.pid;
    manifest.resources.database.startedAt = observation.database.startedAt;
  }
  if (observation.api.identityMatches) {
    manifest.resources.api.containerId = observation.api.id;
    manifest.resources.api.pid = observation.api.pid;
    manifest.resources.api.startedAt = observation.api.startedAt;
    if (observation.api.imageId) manifest.resources.api.imageId = observation.api.imageId;
  }
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(context, manifest);
  return observation;
}

async function waitForHealth(port) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The API process is still opening its port.
    }
    await delay(1000);
  }
  throw new VerificationError('api-unready', `The owned API on 127.0.0.1:${port} did not become ready. The owned database was not removed.`);
}

async function bringUp(context, manifest, secretsEnv, composeArgs) {
  const result = await compose(manifest, composeArgs, context, secretsEnv, { allowFailure: true });
  await recordIdentities(context, manifest);
  if (result.code !== 0) {
    const observation = await observe(context, manifest);
    if (/address already in use|port is already allocated/i.test(result.stderr)) {
      throw new VerificationError('port-conflict', 'A selected port became busy. Owned resources already recorded were left in place.');
    }
    if (observation.database.identityMatches && observation.database.status === 'running') {
      const logs = observation.api?.id
        ? await docker(['logs', '--tail', '60', observation.api.id], context, { allowFailure: true })
        : { stdout: '', stderr: '' };
      throw new VerificationError('api-unready', `The API did not become ready. The owned database for ${manifest.runId} is still running.\n${tail(`${result.stderr}\n${logs.stdout}\n${logs.stderr}`)}`);
    }
    throw new VerificationError('database-unready', `The owned database did not become ready.\n${tail(result.stderr)}`);
  }
  await waitForHealth(manifest.ports.api);
  manifest.phase = 'ready';
  manifest.updatedAt = new Date().toISOString();
  const source = await sourceIdentity(context);
  manifest.source = source;
  await writeManifest(context, manifest);
}

async function ensureApi(context, manifest) {
  const observation = await requireOwnedDatabase(context, manifest);
  const secretsEnv = await readSecrets(context, manifest.runId);
  if (observation.api.identityMatches && observation.api.status === 'running') {
    await waitForHealth(manifest.ports.api);
    return;
  }
  if (observation.api.identityMatches && observation.api.status === 'exited') {
    await docker(['start', observation.api.id], context);
    await waitForHealth(manifest.ports.api);
    await recordIdentities(context, manifest);
    manifest.phase = 'ready';
    await writeManifest(context, manifest);
    return;
  }
  if (!manifest.resources.api.imageId) await buildApi(context, manifest);
  await bringUp(context, manifest, secretsEnv, ['up', '--detach', '--wait', '--wait-timeout', '180', '--no-deps', 'api']);
}

async function createRun(context, options) {
  const source = await sourceIdentity(context);
  const runtime = await runtimeIdentity(context);
  const ports = await allocatePorts(options);
  const suffix = randomBytes(6).toString('hex');
  const runId = `nv-${suffix}`;
  const ownershipToken = randomBytes(16).toString('hex');
  const databasePassword = randomBytes(24).toString('hex');
  const inviteKey = randomBytes(32).toString('hex');
  const referenceKey = randomBytes(32).toString('hex');
  const clerk = forwardedClerk(context.processEnv);
  for (const value of [databasePassword, inviteKey, referenceKey, ...Object.values(clerk)]) {
    rememberCredential(context.secrets, value);
  }
  const project = `spendeazy-nv-${suffix}`;
  const manifest = {
    schemaVersion: 1,
    manager: 'native-verification',
    runId,
    ownershipToken,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: 'starting',
    source,
    runtime,
    ports,
    resources: {
      composeProject: project,
      database: {
        containerId: null,
        volumeName: `${project}-database`,
        networkName: `${project}-network`,
        image: 'postgres:16-alpine',
        databaseName: `nv_${suffix}`,
        user: `nv_${suffix}`,
        pid: null,
        startedAt: null,
      },
      api: {
        containerId: null,
        imageTag: `spendeazy-nv-${suffix}:local`,
        imageId: null,
        pid: null,
        startedAt: null,
      },
    },
    extensions: { ...emptyExtensions },
  };
  const secretsEnv = {
    SPENDEAZY_NV_DB_PASSWORD: databasePassword,
    SPENDEAZY_NV_INVITE_KEY: inviteKey,
    SPENDEAZY_NV_REFERENCE_KEY: referenceKey,
    ...clerk,
  };
  await writeSecrets(context, runId, secretsEnv);
  await writeManifest(context, manifest);
  process.stderr.write(`Starting owned native-verification environment ${runId}.\n`);
  await buildApi(context, manifest);
  await writeManifest(context, manifest);
  await bringUp(context, manifest, secretsEnv, ['up', '--detach', '--wait', '--wait-timeout', '180']);
  return manifest;
}

async function removeContainerIfOwned(context, manifest, role, report) {
  const recordedId = manifest.resources?.[role]?.containerId ?? null;
  if (recordedId) {
    const info = await inspectContainer(context, recordedId);
    if (info && labelsMatch(info, manifest, role) && info.id === recordedId) {
      await docker(['rm', '--force', info.id], context);
      report.removed.containers.push(info.id);
    } else if (info) {
      report.skipped.push({ type: role, id: recordedId, reason: 'not-owned' });
    }
  }
  for (const id of await findContainerIds(context, manifest, role)) {
    if (report.removed.containers.includes(id)) continue;
    await docker(['rm', '--force', id], context);
    report.removed.containers.push(id);
  }
}

async function removeNamedResource(context, kind, name, manifest, report) {
  const observeNamed = kind === 'volume' ? observeVolume : observeNetwork;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const observation = await observeNamed(context, manifest);
    if (!observation.present || observation.name !== name) return;
    if (!observation.identityMatches) {
      report.skipped.push({ type: kind, id: name, reason: 'not-owned' });
      return;
    }
    const removed = await docker([kind, 'rm', name], context, { allowFailure: true });
    if (removed.code === 0) {
      report.removed[kind === 'volume' ? 'volumes' : 'networks'].push(name);
      return;
    }
    await delay(400);
  }
  report.skipped.push({ type: kind, id: name, reason: 'remove-failed' });
}

async function removeImageIfOwned(context, manifest, report) {
  const tag = manifest.resources?.api?.imageTag;
  const recordedId = manifest.resources?.api?.imageId;
  if (!tag || !recordedId) return;
  const result = await docker([
    'image', 'inspect',
    '--format', '{{.Id}}|{{index .Config.Labels "io.spendeazy.native-verification/run-id"}}|{{index .Config.Labels "io.spendeazy.native-verification/ownership-token"}}',
    tag,
  ], context, { allowFailure: true });
  if (result.code !== 0) return;
  const [imageId, runId, token] = result.stdout.trim().split('|');
  if (imageId !== recordedId || runId !== manifest.runId || token !== manifest.ownershipToken) {
    report.skipped.push({ type: 'image', id: tag, reason: 'not-owned' });
    return;
  }
  const users = await docker(['ps', '-aq', '--filter', `ancestor=${imageId}`], context);
  if (users.stdout.trim()) {
    report.skipped.push({ type: 'image', id: tag, reason: 'image-in-use' });
    return;
  }
  const removed = await docker(['image', 'rm', tag], context, { allowFailure: true });
  if (removed.code === 0) report.removed.images.push(tag);
  else report.skipped.push({ type: 'image', id: tag, reason: 'image-in-use' });
}

async function stopRun(context, manifest) {
  const observation = await observe(context, manifest);
  const report = { removed: { containers: [], volumes: [], networks: [], images: [] }, skipped: [] };
  const { stopOwnedMetro } = await import('./native-verification-launch.mjs');
  await stopOwnedMetro(context, manifest, report);
  await rememberStoredSecrets(context, manifest.runId);
  await removeContainerIfOwned(context, manifest, 'api', report);
  await removeContainerIfOwned(context, manifest, 'database', report);
  await removeNamedResource(context, 'volume', observation.volume.name, manifest, report);
  await removeNamedResource(context, 'network', observation.network.name, manifest, report);
  await removeImageIfOwned(context, manifest, report);
  const remaining = await observe(context, manifest);
  const ownedRemains = remaining.database.identityMatches
    || remaining.api.identityMatches
    || remaining.volume.identityMatches
    || remaining.network.identityMatches;
  if (ownedRemains) {
    throw new VerificationError('cleanup-incomplete', `Owned resources for ${manifest.runId} are still present. The manifest was kept.`);
  }
  await rm(runDirectory(context, manifest.runId), { recursive: true, force: true });
  return {
    ok: true,
    operation: 'stop',
    runId: manifest.runId,
    lifecycle: 'stopped',
    removed: report.removed,
    skipped: report.skipped,
  };
}

async function start(context, options) {
  const source = await sourceIdentity(context);
  if (!options.fresh) {
    if (options.runId) {
      const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
      await requireOwnedDatabase(context, manifest);
      if (options.apiPort && options.apiPort !== manifest.ports.api) {
        throw new VerificationError('incompatible-run', `Run ${manifest.runId} already publishes the API on ${manifest.ports.api}.`);
      }
      if (options.databasePort && options.databasePort !== manifest.ports.database) {
        throw new VerificationError('incompatible-run', `Run ${manifest.runId} already publishes the database on ${manifest.ports.database}.`);
      }
      await ensureApi(context, manifest);
      return { exitCode: 0, body: await publicBody(context, manifest, { operation: 'start', reused: true }) };
    }
    const reusable = await selectableRuns(context, source);
    if (reusable.length > 1) {
      throw new VerificationError('multiple-runs', `Several owned runs are live: ${reusable.map((manifest) => manifest.runId).join(', ')}. Pass --run or --new.`);
    }
    if (reusable.length === 1) {
      const manifest = reusable[0];
      if ((options.apiPort && options.apiPort !== manifest.ports.api) || (options.databasePort && options.databasePort !== manifest.ports.database)) {
        throw new VerificationError('incompatible-run', `The live owned run ${manifest.runId} uses different ports. Pass --new to create another run.`);
      }
      await ensureApi(context, manifest);
      return { exitCode: 0, body: await publicBody(context, manifest, { operation: 'start', reused: true }) };
    }
  }
  const manifest = await createRun(context, options);
  return { exitCode: 0, body: await publicBody(context, manifest, { operation: 'start', reused: false }) };
}

async function attach(context, options) {
  const source = await sourceIdentity(context);
  const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
  await requireOwnedDatabase(context, manifest);
  return { exitCode: 0, body: await publicBody(context, manifest, { operation: 'attach' }) };
}

async function status(context, options) {
  const source = await sourceIdentity(context);
  if (!options.runId) {
    const reusable = await selectableRuns(context, source);
    if (reusable.length === 1) options = { ...options, runId: reusable[0].runId };
    else if (reusable.length === 0) throw new VerificationError('no-run', 'No compatible owned run is live for this checkout.');
    else throw new VerificationError('multiple-runs', `Several owned runs are live: ${reusable.map((manifest) => manifest.runId).join(', ')}. Pass --run.`);
  }
  const manifest = await readManifest(context, options.runId);
  if (!manifest) throw new VerificationError('run-not-found', `No manifest exists for ${options.runId}.`);
  return { exitCode: 0, body: await publicBody(context, manifest, { operation: 'status' }) };
}

async function stop(context, options) {
  const source = await sourceIdentity(context);
  const manifest = options.runId
    ? await readManifest(context, options.runId)
    : await resolveSelected(context, options, source, { requireCompatible: false });
  if (!manifest) throw new VerificationError('run-not-found', `No manifest exists for ${options.runId}.`);
  if (!options.runId && !samePath(manifest.source?.root, source.root)) {
    throw new VerificationError('incompatible-run', 'The selected run belongs to a different checkout and was left untouched.');
  }
  return { exitCode: 0, body: await stopRun(context, manifest) };
}

async function replaceApi(context, options) {
  const source = await sourceIdentity(context);
  const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
  const before = await requireOwnedDatabase(context, manifest);
  const previousApiId = before.api.identityMatches ? before.api.id : manifest.resources.api.containerId;
  const databaseId = before.database.id;
  const secretsEnv = await readSecrets(context, manifest.runId);
  await buildApi(context, manifest);
  manifest.source = source;
  manifest.runtime = await runtimeIdentity(context);
  await writeManifest(context, manifest);
  await bringUp(context, manifest, secretsEnv, ['up', '--detach', '--wait', '--wait-timeout', '180', '--no-deps', '--force-recreate', 'api']);
  const after = await observe(context, manifest);
  if (!after.database.identityMatches || after.database.id !== databaseId || after.database.status !== 'running') {
    throw new VerificationError('database-replaced', `API replacement did not keep the owned database for ${manifest.runId}.`);
  }
  return {
    exitCode: 0,
    body: await publicBody(context, manifest, {
      operation: 'replace-api',
      extra: {
        previousApiContainerId: previousApiId,
        databaseContainerId: databaseId,
        apiRebuilt: true,
      },
    }),
  };
}

export async function execute(args, environment = process.env) {
  const secrets = new Set();
  for (const value of [environment.CLERK_JWT_KEY, environment.CLERK_SECRET_KEY]) rememberCredential(secrets, value);
  let operation = null;
  try {
    const options = parseArguments(args);
    if (options.help || options.operation === null && options.help) {
      return { exitCode: 0, body: null, help: helpText() };
    }
    operation = options.operation;
    const context = {
      repoRoot,
      stateDir: options.stateDir || defaultStateDirectory(environment),
      secrets,
      processEnv: environment,
    };
    await mkdir(context.stateDir, { recursive: true });
    let launchModule = null;
    if (operation === 'launch' || operation === 'reload' || operation === 'refresh') {
      launchModule = await import('./native-verification-launch.mjs');
      await launchModule.preflightHost(context, { requireBuildTools: operation === 'launch' });
    }
    if (operation !== 'status' && operation !== 'stop') await requireDocker(context);
    else {
      const info = await docker(['info'], context, { allowFailure: true });
      if (info.missing || info.code !== 0) {
        throw new VerificationError('docker-unavailable', 'Docker is not available. On Windows, start Docker Desktop and switch it to Linux containers.');
      }
    }
    let result;
    if (operation === 'start') result = await start(context, options);
    else if (operation === 'attach') result = await attach(context, options);
    else if (operation === 'status') result = await status(context, options);
    else if (operation === 'stop') result = await stop(context, options);
    else if (operation === 'launch') result = await launchModule.launchNative(context, options);
    else if (operation === 'reload') result = await launchModule.reloadNative(context, options);
    else if (operation === 'refresh') result = await launchModule.refreshNative(context, options);
    else result = await replaceApi(context, options);
    if (result.body) assertNoCredentials('command output', JSON.stringify(result.body), secrets);
    return result;
  } catch (error) {
    const code = error instanceof VerificationError ? error.code : 'failed';
    const message = redact(error instanceof Error ? error.message : String(error), secrets);
    assertNoCredentials('command output', message, secrets);
    const body = { ok: false, operation, code, message };
    if (error instanceof VerificationError && error.outcome) {
      body.outcome = error.outcome;
      body.authenticatedJourneyCertified = false;
      body.statement = error.statement;
    }
    return {
      exitCode: code === 'usage' ? 2 : 1,
      body,
    };
  }
}

async function main() {
  try {
    const result = await execute(process.argv.slice(2));
    if (result.help) process.stdout.write(result.help);
    else process.stdout.write(`${JSON.stringify(result.body)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      operation: null,
      code: 'credential-exposure',
      message: 'The command refused to print a credential.',
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
