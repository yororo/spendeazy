import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertRecordedLaunch } from './native-verification-launch.mjs';
import {
  VerificationError,
  docker,
  observe,
  publicBody,
  readManifest,
  redact,
  requireOwnedDatabase,
  resolveSelected,
  runProcess,
  sourceIdentity,
  writeManifest,
} from './native-verification.mjs';

const statement = 'A passed journey certifies only its UI assertions on the recorded launch. Software checks and authenticated sign-in stay separate.';
const stepActions = new Set(['see', 'tap', 'checkpoint', 'log']);
const logSources = new Set(['metro', 'api', 'device']);

function block(code, message) {
  throw new VerificationError(code, message, 'blocked', statement);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function configuredInt(value, fallback, name, max, min = 1) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new VerificationError('usage', `${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new VerificationError('usage', `${name} is outside the supported range.`);
  }
  return parsed;
}

function bound(text, limit = 240) {
  const single = String(text).replace(/\s+/g, ' ').trim();
  if (single.length <= limit) return single;
  return `${single.slice(0, limit - 3)}...`;
}

function runDirectory(context, runId) {
  return join(context.stateDir, 'runs', runId);
}

function journeyDirectory(context) {
  return resolve(context.processEnv.SPENDEAZY_NV_JOURNEY_DIR || join(context.repoRoot, 'scripts', 'native-journeys'));
}

function journeyPath(context, id) {
  const root = journeyDirectory(context);
  const file = resolve(root, `${id}.mjs`);
  const fromRoot = relative(root, file);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) block('usage', 'The journey id does not stay inside the journey directory.');
  return file;
}

function checkpointPath(context, runId) {
  return join(runDirectory(context, runId), 'journey-checkpoint.json');
}

function adbBin(context) {
  if (context.processEnv.SPENDEAZY_NV_ADB) return context.processEnv.SPENDEAZY_NV_ADB;
  const root = context.processEnv.SPENDEAZY_NV_ANDROID_SDK
    || context.processEnv.ANDROID_SDK_ROOT
    || context.processEnv.ANDROID_HOME
    || '';
  if (root) return join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return 'adb';
}

async function adb(context, args, { allowFailure = false, timeoutMs = 20_000 } = {}) {
  const result = await runProcess(adbBin(context), args, {
    cwd: context.repoRoot,
    env: context.processEnv,
    secrets: context.secrets,
    timeoutMs,
  });
  if (result.missing) block('host-capability', 'adb is not available. Install Android SDK platform-tools or set SPENDEAZY_NV_ADB.');
  if (result.timedOut) {
    throw new VerificationError('journey-failed', 'adb timed out. The journey stopped.', 'failed', statement);
  }
  if (result.code !== 0 && !allowFailure) {
    throw new VerificationError('journey-failed', bound(`adb ${args[0]} failed.`), 'failed', statement);
  }
  return result;
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseNodes(xml) {
  const nodes = [];
  const pattern = /<node\b([^>]*?)\/?>/g;
  let match = pattern.exec(xml);
  while (match) {
    const attrs = {};
    const attr = /([\w:-]+)="([^"]*)"/g;
    let found = attr.exec(match[1]);
    while (found) {
      attrs[found[1]] = decodeXml(found[2]);
      found = attr.exec(match[1]);
    }
    if (attrs.password === 'true' && attrs.text) attrs.text = '[redacted]';
    nodes.push(attrs);
    match = pattern.exec(xml);
  }
  return nodes;
}

function selectorFields(selector) {
  return {
    text: selector?.text || '',
    description: selector?.description || '',
    resourceId: selector?.resourceId || '',
  };
}

function selectorLabel(selector) {
  const fields = selectorFields(selector);
  const parts = [];
  if (fields.text) parts.push(`text ${fields.text}`);
  if (fields.description) parts.push(`description ${fields.description}`);
  if (fields.resourceId) parts.push(`resource ${fields.resourceId}`);
  return parts.join(', ') || 'selector';
}

function matches(node, selector) {
  const fields = selectorFields(selector);
  if (!fields.text && !fields.description && !fields.resourceId) return false;
  if (fields.text && node.text !== fields.text) return false;
  if (fields.description && node['content-desc'] !== fields.description) return false;
  if (fields.resourceId && node['resource-id'] !== fields.resourceId) return false;
  return true;
}

function boundsCenter(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value || '');
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  if (right <= left || bottom <= top) return null;
  return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
}

function stripPasswords(xml) {
  return xml.replace(/<node\b[^>]*\bpassword="true"[^>]*\/?>/g, (node) => node.replace(/\btext="[^"]*"/, 'text="[redacted]"'));
}

async function dumpUi(context, serial, runId) {
  const remote = `/data/local/tmp/${runId}-ui.xml`;
  const dumped = await adb(context, ['-s', serial, 'shell', 'uiautomator', 'dump', remote], { allowFailure: true, timeoutMs: 20_000 });
  if (dumped.code !== 0) return { xml: '', error: 'ui dump failed' };
  const read = await adb(context, ['-s', serial, 'exec-out', 'cat', remote], { allowFailure: true, timeoutMs: 20_000 });
  await adb(context, ['-s', serial, 'shell', 'rm', '-f', remote], { allowFailure: true });
  if (read.code !== 0 || !read.stdout.includes('<hierarchy')) return { xml: read.stdout || '', error: 'ui dump was empty' };
  return { xml: stripPasswords(read.stdout).slice(0, 200_000), error: '' };
}

async function readMetroLog(context, runId) {
  try {
    return await readFile(join(runDirectory(context, runId), 'launch.log'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function tailLines(text, count) {
  return text.split(/\r?\n/).filter((line) => line.length > 0).slice(-count).map((line) => line.slice(0, 500)).join('\n');
}

async function collectDiagnostics(context, manifest, serial) {
  const metroRaw = await readMetroLog(context, manifest.runId);
  const observation = await observe(context, manifest);
  let apiRaw = '';
  let apiAvailable = false;
  if (observation.api.identityMatches && observation.api.id) {
    const logs = await docker(['logs', '--tail', '80', observation.api.id], context, { allowFailure: true });
    apiAvailable = logs.code === 0;
    apiRaw = `${logs.stdout}\n${logs.stderr}`;
  }
  const logcat = await adb(context, ['-s', serial, 'logcat', '-d', '-t', '80'], { allowFailure: true, timeoutMs: 15_000 });
  return {
    metro: { available: metroRaw.length > 0, text: tailLines(metroRaw, 80) },
    api: { available: apiAvailable, text: tailLines(apiRaw, 80) },
    device: { available: logcat.code === 0, text: tailLines(logcat.stdout || '', 80) },
  };
}

async function writeCapture(context, manifest, attemptId, diagnostics, uiXml, resumed) {
  const directory = join(runDirectory(context, manifest.runId), 'nv-captures', attemptId);
  await mkdir(directory, { recursive: true });
  const files = {
    metro: redact(diagnostics.metro.text, context.secrets),
    api: redact(diagnostics.api.text, context.secrets),
    device: redact(diagnostics.device.text, context.secrets),
    ui: redact(uiXml, context.secrets),
  };
  await writeFile(join(directory, 'metro.log'), files.metro);
  await writeFile(join(directory, 'api.log'), files.api);
  await writeFile(join(directory, 'logcat.txt'), files.device);
  await writeFile(join(directory, 'ui.xml'), files.ui);
  const index = {
    runId: manifest.runId,
    attemptId,
    resumed,
    capturedAt: new Date().toISOString(),
    sources: {
      metro: diagnostics.metro.available ? 'captured' : 'unavailable',
      api: diagnostics.api.available ? 'captured' : 'unavailable',
      device: diagnostics.device.available ? 'captured' : 'unavailable',
    },
  };
  await writeFile(join(directory, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  const base = `nv-captures/${attemptId}`;
  return [
    { kind: 'metro', ref: `${base}/metro.log`, bytes: Buffer.byteLength(files.metro), runId: manifest.runId },
    { kind: 'api', ref: `${base}/api.log`, bytes: Buffer.byteLength(files.api), runId: manifest.runId },
    { kind: 'device', ref: `${base}/logcat.txt`, bytes: Buffer.byteLength(files.device), runId: manifest.runId },
    { kind: 'ui', ref: `${base}/ui.xml`, bytes: Buffer.byteLength(files.ui), runId: manifest.runId },
    { kind: 'index', ref: `${base}/index.json`, bytes: Buffer.byteLength(JSON.stringify(index)), runId: manifest.runId },
  ];
}

function pollInterval(context) {
  return configuredInt(context.processEnv.SPENDEAZY_NV_JOURNEY_POLL_MS, 500, 'SPENDEAZY_NV_JOURNEY_POLL_MS', 5_000, 40);
}

function stepTimeout(context, requested) {
  const fallback = configuredInt(context.processEnv.SPENDEAZY_NV_JOURNEY_STEP_TIMEOUT_MS, 15_000, 'SPENDEAZY_NV_JOURNEY_STEP_TIMEOUT_MS', 120_000, 100);
  const value = requested === undefined ? fallback : configuredInt(requested, fallback, 'step timeoutMs', 120_000, 100);
  return value;
}

async function waitForNode(context, serial, runId, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { xml: '', error: '' };
  let found = null;
  for (;;) {
    last = await dumpUi(context, serial, runId);
    if (!last.error) {
      found = parseNodes(last.xml).find((node) => matches(node, selector)) || null;
      if (found) return { found, xml: last.xml, error: '' };
    }
    if (Date.now() >= deadline) return { found: null, xml: last.xml, error: last.error };
    await delay(Math.min(pollInterval(context), Math.max(0, deadline - Date.now())));
  }
}

function assertion(step, outcome, reason) {
  return {
    id: step.id,
    action: step.action,
    required: step.required !== false,
    outcome,
    reason: bound(redact(reason, new Set())),
    certifies: step.required !== false && outcome === 'passed',
  };
}

function validateSelector(step) {
  const fields = selectorFields(step.selector);
  if (!fields.text && !fields.description && !fields.resourceId) {
    block('invalid-journey', `Journey step ${step.id} needs a text, description, or resourceId selector.`);
  }
}

function validateDefinition(definition, id) {
  if (!definition || typeof definition !== 'object' || definition.id !== id) {
    block('invalid-journey', `Journey ${id} must export an id that matches its file name.`);
  }
  if (definition.retired) {
    if (typeof definition.retired.reason !== 'string' || !definition.retired.reason.trim()) {
      block('invalid-journey', `Retired journey ${id} needs a documented reason.`);
    }
    return;
  }
  if (!Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > 20) {
    block('invalid-journey', `Journey ${id} needs between 1 and 20 steps.`);
  }
  const seen = new Set();
  for (const step of definition.steps) {
    if (!step || typeof step.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.id) || seen.has(step.id)) {
      block('invalid-journey', `Journey ${id} has a missing or duplicate step id.`);
    }
    seen.add(step.id);
    if (!stepActions.has(step.action)) block('invalid-journey', `Journey step ${step.id} has an unsupported action.`);
    if (step.action === 'see' || step.action === 'tap') validateSelector(step);
    if (step.action === 'checkpoint' && (typeof step.reason !== 'string' || !step.reason.trim())) {
      block('invalid-journey', `Checkpoint ${step.id} needs a reason.`);
    }
    if (step.action === 'log') {
      if (!logSources.has(step.source) || typeof step.includes !== 'string' || !step.includes.trim()) {
        block('invalid-journey', `Log step ${step.id} needs a metro, api, or device source and text.`);
      }
    }
  }
}

async function loadDefinition(context, id, attemptId) {
  const file = journeyPath(context, id);
  let text = '';
  try {
    text = await readFile(file, 'utf8');
    await stat(file);
  } catch (error) {
    if (error.code === 'ENOENT') block('journey-not-found', `No journey definition ${id} is in ${journeyDirectory(context)}.`);
    throw error;
  }
  let loaded;
  try {
    loaded = await import(`${pathToFileURL(file).href}?attempt=${attemptId}`);
  } catch (error) {
    block('invalid-journey', bound(`Journey ${id} could not be loaded. ${error instanceof Error ? error.message : 'import failed'}`));
  }
  const definition = loaded.default;
  validateDefinition(definition, id);
  return {
    definition,
    fingerprint: createHash('sha256').update(text).digest('hex'),
  };
}

function identitySnapshot(manifest, launch) {
  return {
    runId: manifest.runId,
    sourceFingerprint: launch.source.fingerprint,
    configurationFingerprint: launch.build.configurationFingerprint,
    nativeBuildFingerprint: launch.build.fingerprint,
    apiImageId: launch.apiImageId,
    serial: launch.device.serial,
    abi: launch.device.abi,
  };
}

function sameIdentity(left, right) {
  return left
    && right
    && left.runId === right.runId
    && left.sourceFingerprint === right.sourceFingerprint
    && left.configurationFingerprint === right.configurationFingerprint
    && left.nativeBuildFingerprint === right.nativeBuildFingerprint
    && left.apiImageId === right.apiImageId
    && left.serial === right.serial
    && left.abi === right.abi;
}

function claimsFor(outcome, build) {
  const uiPassed = outcome === 'passed';
  return {
    softwareChecks: { outcome: 'not-run', certifies: false },
    buildInstallation: build?.fingerprint
      ? { outcome: 'recorded', certifies: false, nativeBuildFingerprint: build.fingerprint }
      : { outcome: 'missing', certifies: false },
    uiAssertions: { outcome, certifies: uiPassed },
  };
}

function journeyOutcome(assertions) {
  if (assertions.some((item) => item.outcome === 'failed')) return 'failed';
  if (assertions.some((item) => item.outcome === 'human-pending')) return 'human-pending';
  if (assertions.some((item) => item.outcome === 'blocked')) return 'blocked';
  const required = assertions.filter((item) => item.required);
  if (required.length > 0 && required.every((item) => item.outcome === 'passed')) return 'passed';
  return 'skipped';
}

async function readCheckpoint(context, runId) {
  try {
    return JSON.parse(await readFile(checkpointPath(context, runId), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    block('invalid-journey', 'The journey checkpoint could not be read.');
  }
  return null;
}

async function logText(context, manifest, serial, source) {
  const diagnostics = await collectDiagnostics(context, manifest, serial);
  return { diagnostics, text: redact(diagnostics[source].text, context.secrets), available: diagnostics[source].available };
}

export async function runSelectedJourney(context, options, mode) {
  try {
    return await executeJourney(context, options, mode);
  } catch (error) {
    if (error instanceof VerificationError && !error.outcome) {
      throw new VerificationError(error.code, error.message, 'blocked', statement);
    }
    throw error;
  }
}

async function executeJourney(context, options, { resume }) {
  const attemptSeed = `ja-${randomBytes(6).toString('hex')}`;
  const loaded = await loadDefinition(context, options.journey, attemptSeed);
  const source = await sourceIdentity(context);
  const manifest = await resolveSelected(context, options, source, { requireCompatible: true });
  await requireOwnedDatabase(context, manifest);
  if (loaded.definition.retired) {
    const reason = bound(loaded.definition.retired.reason);
    const body = await publicBody(context, manifest, {
      operation: resume ? 'resume' : 'journey',
      extra: {
        ok: false,
        outcome: 'skipped',
        certified: false,
        authenticatedJourneyCertified: false,
        statement,
        journey: {
          id: options.journey,
          attemptId: attemptSeed,
          summary: loaded.definition.summary || '',
          retired: true,
          reason,
          assertions: [],
          claims: claimsFor('skipped', null),
        },
        evidence: [],
      },
    });
    return { exitCode: 1, body };
  }
  const launch = await assertRecordedLaunch(context, manifest, source);
  const identity = identitySnapshot(manifest, launch);
  let start = 0;
  let attemptId = attemptSeed;
  let completed = [];
  if (resume) {
    const checkpoint = await readCheckpoint(context, manifest.runId);
    if (!checkpoint) block('checkpoint-missing', `Run ${manifest.runId} has no human checkpoint to resume.`);
    if (checkpoint.journeyId !== options.journey) {
      block('incompatible-resume', `The checkpoint is for ${checkpoint.journeyId}. It was not resumed as ${options.journey}.`);
    }
    if (checkpoint.definitionFingerprint !== loaded.fingerprint || !sameIdentity(checkpoint.identity, identity)) {
      block('incompatible-resume', `The checkpoint does not match the recorded launch for ${manifest.runId}.`);
    }
    start = checkpoint.nextStep;
    attemptId = checkpoint.attemptId;
    completed = Array.isArray(checkpoint.assertions) ? checkpoint.assertions : [];
  } else {
    await rm(checkpointPath(context, manifest.runId), { force: true });
  }
  const assertions = [...completed];
  let uiXml = '';
  let diagnostics = {
    metro: { available: false, text: '' },
    api: { available: false, text: '' },
    device: { available: false, text: '' },
  };
  const steps = loaded.definition.steps;
  for (let index = start; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.action === 'checkpoint') {
      assertions.push(assertion(step, 'human-pending', step.reason));
      for (const pending of steps.slice(index + 1)) assertions.push(assertion(pending, 'not-run', 'waiting for the human checkpoint'));
      const checkpoint = {
        journeyId: options.journey,
        attemptId,
        nextStep: index + 1,
        definitionFingerprint: loaded.fingerprint,
        identity,
        reason: bound(redact(step.reason, context.secrets)),
        assertions: assertions
          .filter((item) => item.outcome === 'passed' || item.outcome === 'skipped')
          .map((item) => ({ ...item, reason: bound(redact(item.reason, context.secrets)) })),
      };
      await writeFile(checkpointPath(context, manifest.runId), redact(`${JSON.stringify(checkpoint, null, 2)}\n`, context.secrets));
      break;
    }
    if (step.action === 'log') {
      const timeoutMs = stepTimeout(context, step.timeoutMs);
      const deadline = Date.now() + timeoutMs;
      let found = false;
      let available = false;
      while (Date.now() <= deadline) {
        const looked = await logText(context, manifest, launch.device.serial, step.source);
        diagnostics = looked.diagnostics;
        available = looked.available;
        found = available && looked.text.includes(redact(step.includes, context.secrets));
        if (found || !available) break;
        if (Date.now() >= deadline) break;
        await delay(Math.min(pollInterval(context), Math.max(0, deadline - Date.now())));
      }
      const outcome = found ? 'passed' : (step.required === false ? 'skipped' : 'failed');
      const reason = found
        ? `${step.source} log included the expected text`
        : (available ? `${step.source} log did not include the expected text before the timeout` : `${step.source} diagnostics were unavailable`);
      assertions.push(assertion(step, outcome, reason));
      if (outcome === 'failed') {
        for (const pending of steps.slice(index + 1)) assertions.push(assertion(pending, 'not-run', 'stopped after a failed assertion'));
        break;
      }
      continue;
    }
    const timeoutMs = stepTimeout(context, step.timeoutMs);
    const waited = await waitForNode(context, launch.device.serial, manifest.runId, step.selector, timeoutMs);
    uiXml = waited.xml || uiXml;
    if (!waited.found) {
      const reason = waited.error
        ? `${waited.error} while looking for ${selectorLabel(step.selector)}`
        : `${selectorLabel(step.selector)} was not on screen before the timeout`;
      assertions.push(assertion(step, step.required === false ? 'skipped' : 'failed', reason));
      if (assertions.at(-1).outcome === 'failed') {
        for (const pending of steps.slice(index + 1)) assertions.push(assertion(pending, 'not-run', 'stopped after a failed assertion'));
        break;
      }
      continue;
    }
    if (step.action === 'tap') {
      const center = boundsCenter(waited.found.bounds);
      if (!center) {
        assertions.push(assertion(step, 'failed', `${selectorLabel(step.selector)} had no tappable bounds`));
        for (const pending of steps.slice(index + 1)) assertions.push(assertion(pending, 'not-run', 'stopped after a failed assertion'));
        break;
      }
      const tapped = await adb(context, ['-s', launch.device.serial, 'shell', 'input', 'tap', String(center.x), String(center.y)], { allowFailure: true });
      if (tapped.code !== 0) {
        assertions.push(assertion(step, 'failed', `tap failed for ${selectorLabel(step.selector)}`));
        for (const pending of steps.slice(index + 1)) assertions.push(assertion(pending, 'not-run', 'stopped after a failed assertion'));
        break;
      }
    }
    assertions.push(assertion(step, 'passed', `matched ${selectorLabel(step.selector)}`));
  }
  for (const item of assertions) item.reason = bound(redact(item.reason, context.secrets));
  const outcome = journeyOutcome(assertions);
  let evidence = [];
  try {
    diagnostics = await collectDiagnostics(context, manifest, launch.device.serial);
    evidence = await writeCapture(context, manifest, attemptId, diagnostics, uiXml, resume);
  } catch (error) {
    evidence = [{
      kind: 'capture',
      ref: '',
      bytes: 0,
      runId: manifest.runId,
      reason: bound(error instanceof Error ? error.message : 'capture failed'),
    }];
  }
  const current = await readManifest(context, manifest.runId);
  current.extensions = current.extensions || {};
  current.extensions.evidence = {
    ...(current.extensions.evidence || {}),
    journey: {
      attemptId,
      journeyId: options.journey,
      outcome,
      at: new Date().toISOString(),
      ...identity,
    },
  };
  current.updatedAt = new Date().toISOString();
  await writeManifest(context, current);
  const certified = outcome === 'passed';
  const body = await publicBody(context, current, {
    operation: resume ? 'resume' : 'journey',
    extra: {
      ok: certified,
      outcome,
      certified,
      authenticatedJourneyCertified: false,
      statement,
      journey: {
        id: options.journey,
        attemptId,
        summary: loaded.definition.summary || '',
        retired: false,
        assertions,
        claims: claimsFor(outcome, launch.build),
        identity,
      },
      evidence,
    },
  });
  return { exitCode: certified ? 0 : 1, body };
}
