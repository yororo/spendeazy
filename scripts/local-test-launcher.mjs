import { createHmac, randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDirectory = resolve(rootDirectory, "api");
const webDirectory = resolve(rootDirectory, "web");
const composeFile = resolve(rootDirectory, "local-test", "docker-compose.yml");

const tokenPrefix = "spendeazy-local-test.v1";
const testUserId = "local-test-populated-user";
const localTestInvitationCodeEncryptionKey =
  "0123456789abcdef".repeat(4);
const fixedE2eClock =
  process.env.SPENDEAZY_E2E_TEST_CLOCK?.trim() ?? "2026-09-19T12:00:00.000Z";

const isE2e = process.argv.includes("--e2e");
const shouldReset = process.argv.includes("--reset");

const children = new Set();
let shuttingDown = false;
let ownsComposeProject = false;
let configuration;

async function main() {
  let exitCode = 0;
  try {
    if (isE2e && shouldReset) {
      throw new Error("Use either --e2e or --reset, not both.");
    }

    if (!existsSync(composeFile)) {
      throw new Error(`Missing local test Docker Compose file: ${composeFile}`);
    }

    configuration = await createConfiguration();
    await assertPortAvailable(configuration.databasePort, "PostgreSQL");
    await assertPortAvailable(configuration.apiPort, "API");
    await assertPortAvailable(configuration.webPort, "web");

    const sessionSecret = randomBytes(32).toString("base64url");
    const sessionToken = createSessionToken(
      sessionSecret,
      configuration.testClock,
    );
    const databaseUrl = createDatabaseUrl(configuration);
    const composeEnvironment = {
      ...process.env,
      SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
      SPENDEAZY_TEST_DB_USER: configuration.databaseUser,
      SPENDEAZY_TEST_DB_PASSWORD: configuration.databasePassword,
      SPENDEAZY_TEST_DB_NAME: configuration.databaseName,
      SPENDEAZY_TEST_DB_VOLUME: configuration.databaseVolume,
    };

    ownsComposeProject = true;
    await run("docker", composeArguments("up", "-d"), {
      cwd: rootDirectory,
      env: composeEnvironment,
    });
    await waitForPort(configuration.databasePort, "PostgreSQL");

    const apiEnvironment = {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(configuration.apiPort),
      DATABASE_URL: databaseUrl,
      CORS_ORIGINS: `http://127.0.0.1:${configuration.webPort}`,
      INVITATION_CODE_ENCRYPTION_KEY: localTestInvitationCodeEncryptionKey,
      SPENDEAZY_LOCAL_TEST: "1",
      SPENDEAZY_LOCAL_TEST_SEED_FIXTURES: isE2e ? "0" : "1",
      SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
      SPENDEAZY_TEST_DB_USER: configuration.databaseUser,
      SPENDEAZY_TEST_DB_PASSWORD: configuration.databasePassword,
      SPENDEAZY_TEST_DB_NAME: configuration.databaseName,
      SPENDEAZY_TEST_SESSION_SECRET: sessionSecret,
      ...(configuration.testClock
        ? { SPENDEAZY_TEST_CLOCK: configuration.testClock }
        : {}),
    };

    await runWithRetries(
      "npm",
      npmArguments(
        "run",
        shouldReset ? "local-test:reset" : "local-test:migrate",
      ),
      { cwd: apiDirectory, env: apiEnvironment },
      shouldReset
        ? "the dedicated database reset"
        : "the dedicated database migration and fixture setup",
    );

    start("npm", npmArguments("run", "local-test:server"), {
      cwd: apiDirectory,
      env: apiEnvironment,
    });
    await waitForHttp(
      `http://127.0.0.1:${configuration.apiPort}/health`,
      "the API readiness endpoint",
    );

    const webEnvironment = {
      ...process.env,
      VITE_API_BASE_URL: `http://127.0.0.1:${configuration.apiPort}`,
      VITE_LOCAL_TEST_SESSION_TOKEN: sessionToken,
      SPENDEAZY_E2E_API_BASE_URL: `http://127.0.0.1:${configuration.apiPort}`,
      ...(configuration.testDate
        ? {
            SPENDEAZY_E2E_TEST_DATE: configuration.testDate,
            SPENDEAZY_E2E_TEST_CLOCK: configuration.testClock,
          }
        : {}),
    };
    start(
      "npm",
      npmArguments(
        "run",
        "local-test:dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(configuration.webPort),
      ),
      { cwd: webDirectory, env: webEnvironment },
    );
    await waitForHttp(
      `http://127.0.0.1:${configuration.webPort}/`,
      "the web development server",
    );

    const url = `http://127.0.0.1:${configuration.webPort}/`;
    console.log(`Local test environment ready: ${url}`);
    console.log("Press Ctrl+C to stop the API, web server, and test database.");

    if (isE2e) {
      await run("npm", npmArguments("run", "test:e2e"), {
        cwd: webDirectory,
        env: {
          ...webEnvironment,
          SPENDEAZY_E2E_BASE_URL: url,
        },
      });
      return;
    }

    await openBrowser(url);
    await waitForChildren();
  } catch (error) {
    exitCode = 1;
    console.error(`Local test run failed: ${formatError(error)}`);
  } finally {
    await shutdown(exitCode);
  }

  if (exitCode !== 0) process.exitCode = exitCode;
}

async function createConfiguration() {
  if (!isE2e) {
    return {
      projectName: "spendeazy-local-test",
      databasePort: 55432,
      apiPort: 3100,
      webPort: 5174,
      databaseUser: "spendeazy_test_user",
      databasePassword: "spendeazy_local_test_password",
      databaseName: "spendeazy_test_db",
      databaseVolume: "spendeazy-local-test-data",
      testClock: undefined,
      testDate: undefined,
    };
  }

  const runId = randomBytes(8).toString("hex");
  const testDate = parseFixedE2eDate(fixedE2eClock);
  return {
    projectName: `spendeazy-local-test-e2e-${runId}`,
    databasePort: await findAvailablePort(55432, 59999),
    apiPort: await findAvailablePort(3100, 3999),
    webPort: await findAvailablePort(4100, 4999),
    databaseUser: `spendeazy_e2e_${runId}`,
    databasePassword: randomBytes(24).toString("base64url"),
    databaseName: `spendeazy_e2e_${runId}`,
    databaseVolume: `spendeazy-local-test-e2e-${runId}-data`,
    testClock: fixedE2eClock,
    testDate,
  };
}

function createDatabaseUrl(currentConfiguration) {
  return `postgresql://${encodeURIComponent(currentConfiguration.databaseUser)}:${encodeURIComponent(currentConfiguration.databasePassword)}@127.0.0.1:${currentConfiguration.databasePort}/${encodeURIComponent(currentConfiguration.databaseName)}`;
}

function composeArguments(...argumentsToAppend) {
  return [
    "compose",
    "--project-name",
    configuration.projectName,
    "--file",
    composeFile,
    ...argumentsToAppend,
  ];
}

function npmArguments(...argumentsToAppend) {
  return argumentsToAppend;
}

function start(command, argumentsToRun, options) {
  const child = spawnCommand(command, argumentsToRun, {
    ...options,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && (code ?? 0) !== 0) {
      console.error(`${command} exited with ${signal ?? `code ${code}`}.`);
      void shutdown(code ?? 1);
    }
  });
  return child;
}

function run(command, argumentsToRun, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnCommand(command, argumentsToRun, {
      ...options,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if ((code ?? 1) === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`));
    });
  });
}

async function runWithRetries(command, argumentsToRun, options, label) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await run(command, argumentsToRun, options);
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw new Error(`Could not complete ${label}: ${formatError(lastError)}`);
}

function spawnCommand(command, argumentsToRun, options) {
  if (process.platform === "win32" && command === "npm") {
    const commandLine = ["npm.cmd", ...argumentsToRun]
      .map(quoteWindowsArgument)
      .join(" ");
    return spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", commandLine],
      options,
    );
  }

  return spawn(command, argumentsToRun, options);
}

function quoteWindowsArgument(value) {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

async function assertPortAvailable(port, label) {
  if (await isPortAvailable(port)) return;

  throw new Error(
    `${label} port ${port} is occupied. Stop the process using 127.0.0.1:${port} or choose the dedicated launcher configuration.`,
  );
}

async function findAvailablePort(minimum, maximum) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = randomInt(minimum, maximum + 1);
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(
    `Could not find an available loopback port between ${minimum} and ${maximum}.`,
  );
}

async function isPortAvailable(port) {
  const server = createServer();
  return new Promise((resolvePromise, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolvePromise(false);
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function waitForPort(port, label) {
  await waitUntil(
    () =>
      new Promise((resolvePromise) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolvePromise(true);
        });
        socket.once("error", () => {
          socket.destroy();
          resolvePromise(false);
        });
      }),
    label,
  );
}

async function waitForHttp(url, label) {
  await waitUntil(async () => {
    try {
      const response = await fetch(url);
      return response.status === 200;
    } catch {
      return false;
    }
  }, label);
}

async function waitUntil(check, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await delay(500);
  }

  throw new Error(`${label} did not become ready within 30 seconds.`);
}

async function waitForChildren() {
  await new Promise((resolvePromise) => {
    const handleSignal = () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      resolvePromise();
    };
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
  });
}

async function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? "cmd.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const argumentsToRun =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(command, argumentsToRun, {
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("spawn", resolvePromise);
    });
  } catch {
    console.log(`Open the local test app manually at ${url}`);
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const stoppingChildren = [...children].map(
    (child) =>
      new Promise((resolvePromise) => {
        child.once("exit", resolvePromise);
        terminateChild(child);
      }),
  );
  if (stoppingChildren.length > 0) {
    let timeout;
    await Promise.race([
      Promise.all(stoppingChildren),
      new Promise((resolvePromise) => {
        timeout = setTimeout(resolvePromise, 5000);
        timeout.unref?.();
      }),
    ]);
    if (timeout) clearTimeout(timeout);
  }
  children.clear();

  if (!ownsComposeProject || !configuration) {
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  try {
    await run("docker", composeArguments("down", ...(isE2e ? ["-v"] : [])), {
      cwd: rootDirectory,
      env: {
        ...process.env,
        SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
        SPENDEAZY_TEST_DB_USER: configuration.databaseUser,
        SPENDEAZY_TEST_DB_PASSWORD: configuration.databasePassword,
        SPENDEAZY_TEST_DB_NAME: configuration.databaseName,
        SPENDEAZY_TEST_DB_VOLUME: configuration.databaseVolume,
      },
    });
  } catch (error) {
    console.error(
      `Could not stop the dedicated test database: ${formatError(error)}`,
    );
    exitCode = exitCode || 1;
  }

  if (exitCode !== 0) process.exitCode = exitCode;
}

function terminateChild(child) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

function createSessionToken(secret, testClock) {
  const issuedAt = testClock
    ? Math.floor(Date.parse(testClock) / 1000)
    : Math.floor(Date.now() / 1000);
  const payload = {
    environment: "spendeazy-local-test",
    sub: testUserId,
    sid: `local-test-session-${randomBytes(12).toString("hex")}`,
    iat: issuedAt,
    exp: issuedAt + 60 * 60,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const unsignedToken = `${tokenPrefix}.${encodedPayload}`;
  const signature = createHmac("sha256", secret)
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function parseFixedE2eDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(
      "SPENDEAZY_E2E_TEST_CLOCK must be an ISO-8601 UTC timestamp",
    );
  }

  return value.slice(0, 10);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

main().catch(async (error) => {
  console.error(`Local test startup failed: ${formatError(error)}`);
  await shutdown(1);
});
