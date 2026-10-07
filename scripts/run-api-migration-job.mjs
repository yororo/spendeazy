import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set`);
  return value;
};

const jobName = required("MIGRATION_JOB_NAME");
const resourceGroup = required("AZURE_RESOURCE_GROUP");
const environment = required("CONTAINERAPPS_ENVIRONMENT");
const image = required("MIGRATION_IMAGE");
const databaseUrl = required("DATABASE_URL");
const registryUsername = required("REGISTRY_USERNAME");
const registryPassword = required("REGISTRY_PASSWORD");
const azureCli = process.env.AZURE_CLI ?? "az";
const pollIntervalMs = Number(process.env.MIGRATION_POLL_INTERVAL_MS ?? 10_000);
const pollTimeoutMs = Number(process.env.MIGRATION_POLL_TIMEOUT_MS ?? 35 * 60_000);

if (!/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(jobName) || jobName.includes("--")) {
  throw new Error("MIGRATION_JOB_NAME must be a valid Azure Container Apps job name");
}

function runAzure(args, { quiet = false } = {}) {
  const result = spawnSync(azureCli, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: Number(process.env.AZURE_CLI_TIMEOUT_MS ?? 120_000),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stderr ?? ""}${result.stdout ?? ""}`
      .replaceAll(databaseUrl, "[redacted database URL]")
      .replaceAll(registryPassword, "[redacted registry password]")
      .trim();
    throw new Error(`az ${args[0]} ${args[1]} failed${output ? `: ${output}` : ""}`);
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(result.stdout);
  return result.stdout?.trim() ?? "";
}

let createAttempted = false;
let migrationError;

try {
  createAttempted = true;
  runAzure([
    "containerapp", "job", "create",
    "--name", jobName,
    "--resource-group", resourceGroup,
    "--environment", environment,
    "--trigger-type", "Manual",
    "--replica-timeout", "1800",
    "--replica-retry-limit", "0",
    "--replica-completion-count", "1",
    "--parallelism", "1",
    "--cpu", "0.5",
    "--memory", "1Gi",
    "--image", image,
    "--command", "node",
    "--args", "dist/database/migrate.js",
    "--registry-server", "docker.io",
    "--registry-username", registryUsername,
    "--registry-password", registryPassword,
    "--secrets", `database-url=${databaseUrl}`,
    "--env-vars", "DATABASE_URL=secretref:database-url",
    "--output", "none",
  ], { quiet: true });

  runAzure([
    "containerapp", "job", "start",
    "--name", jobName,
    "--resource-group", resourceGroup,
    "--output", "none",
  ], { quiet: true });

  const deadline = Date.now() + pollTimeoutMs;
  let lastStatus = "Waiting for execution";
  while (Date.now() < deadline) {
    const executions = JSON.parse(runAzure([
      "containerapp", "job", "execution", "list",
      "--name", jobName,
      "--resource-group", resourceGroup,
      "--output", "json",
    ], { quiet: true }) || "[]");
    const execution = executions[0];
    if (execution) {
      const status = execution.properties?.status ?? "Unknown";
      if (status !== lastStatus) {
        console.log(`Migration execution ${execution.name}: ${status}`);
        lastStatus = status;
      }
      if (status === "Succeeded") {
        console.log("API migrations completed and schema readiness was confirmed.");
        break;
      }
      if (["Failed", "Stopped", "Canceled", "Cancelled"].includes(status)) {
        throw new Error(`API migration execution ${execution.name} ended with ${status}`);
      }
    }
    await delay(pollIntervalMs);
  }

  if (lastStatus !== "Succeeded") {
    throw new Error(`API migration did not succeed within ${Math.ceil(pollTimeoutMs / 60_000)} minutes (last status: ${lastStatus})`);
  }
} catch (error) {
  migrationError = error;
} finally {
  if (createAttempted) {
    try {
      runAzure([
        "containerapp", "job", "delete",
        "--name", jobName,
        "--resource-group", resourceGroup,
        "--yes",
        "--output", "none",
      ], { quiet: true });
      console.log(`Removed temporary migration job ${jobName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Could not remove temporary migration job ${jobName}: ${message}`);
      if (!migrationError) migrationError = error;
    }
  }
}

if (migrationError) {
  const message = migrationError instanceof Error ? migrationError.message : String(migrationError);
  console.error(`Blocking API deployment: ${message}`);
  process.exitCode = 1;
}
