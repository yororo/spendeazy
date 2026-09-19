import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDirectory = resolve(rootDirectory, "api");
const webDirectory = resolve(rootDirectory, "web");
const composeFile = resolve(rootDirectory, "local-test", "docker-compose.yml");

const databaseUser = "spendeazy_test_user";
const databasePassword = "spendeazy_local_test_password";
const databaseName = "spendeazy_test_db";
const tokenPrefix = "spendeazy-local-test.v1";
const testUserId = "local-test-populated-user";

const isE2e = process.argv.includes("--e2e");
const shouldReset = process.argv.includes("--reset");
const e2eTestDate = isE2e ? currentLocalDate() : undefined;
const configuration = isE2e
  ? {
      projectName: "spendeazy-local-test-e2e",
      databasePort: 55433,
      apiPort: 3101,
      webPort: 5175,
    }
  : {
      projectName: "spendeazy-local-test",
      databasePort: 55432,
      apiPort: 3100,
      webPort: 5174,
    };

const children = new Set();
let shuttingDown = false;

async function main() {
  if (isE2e && shouldReset) {
    throw new Error("Use either --e2e or --reset, not both.");
  }

  if (!existsSync(composeFile)) {
    throw new Error(`Missing local test Docker Compose file: ${composeFile}`);
  }

  await assertPortAvailable(configuration.databasePort, "PostgreSQL");
  await assertPortAvailable(configuration.apiPort, "API");
  await assertPortAvailable(configuration.webPort, "web");

  const sessionSecret = randomBytes(32).toString("base64url");
  const sessionToken = createSessionToken(sessionSecret);
  const databaseUrl = `postgresql://${databaseUser}:${databasePassword}@127.0.0.1:${configuration.databasePort}/${databaseName}`;
  const composeEnvironment = {
    ...process.env,
    SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
  };

  if (isE2e) {
    await run("docker", composeArguments("down", "-v"), {
      cwd: rootDirectory,
      env: composeEnvironment,
    });
  }

  try {
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
      SPENDEAZY_LOCAL_TEST: "1",
      SPENDEAZY_LOCAL_TEST_SEED_FIXTURES: isE2e ? "0" : "1",
      SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
      SPENDEAZY_TEST_SESSION_SECRET: sessionSecret,
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
      ...(e2eTestDate ? { SPENDEAZY_E2E_TEST_DATE: e2eTestDate } : {}),
      ...(process.platform === "win32"
        ? { PLAYWRIGHT_CHANNEL: "msedge" }
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
  } finally {
    await shutdown();
  }
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

      reject(
        new Error(`${command} exited with ${signal ?? `code ${code}`}.`),
      );
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

  throw new Error(`Could not complete ${label}: ${lastError?.message ?? lastError}`);
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
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `${label} port ${port} is occupied. Stop the process using 127.0.0.1:${port} or choose the dedicated launcher configuration.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolvePromise());
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
  await waitUntil(
    async () => {
      try {
        const response = await fetch(url);
        return response.status === 200;
      } catch {
        return false;
      }
    },
    label,
  );
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
  await Promise.race([
    Promise.all(stoppingChildren),
    delay(5000),
  ]);
  children.clear();

  try {
    await run("docker", composeArguments("down", ...(isE2e ? ["-v"] : [])), {
      cwd: rootDirectory,
      env: {
        ...process.env,
        SPENDEAZY_TEST_DB_PORT: String(configuration.databasePort),
      },
    });
  } catch (error) {
    console.error(`Could not stop the dedicated test database: ${error.message}`);
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

function createSessionToken(secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
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
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function currentLocalDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

main().catch(async (error) => {
  console.error(`Local test startup failed: ${error.message}`);
  await shutdown(1);
});
