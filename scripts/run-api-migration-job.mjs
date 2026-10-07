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

function redact(value) {
  return String(value)
    .replaceAll(databaseUrl, "<REDACTED>")
    .replaceAll(registryPassword, "<REDACTED>")
    .replaceAll(registryUsername, "<REDACTED>")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "<REDACTED>");
}

function runAzure(args, { quiet = false } = {}) {
  const result = spawnSync(azureCli, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: Number(process.env.AZURE_CLI_TIMEOUT_MS ?? 120_000),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = redact(`${result.stderr ?? ""}${result.stdout ?? ""}`).trim();
    throw new Error(`az ${args[0]} ${args[1]} failed${output ? `: ${output}` : ""}`);
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(redact(result.stdout));
  return result.stdout?.trim() ?? "";
}

let createAttempted = false;
let migrationError;
let executionName;

// Temporary diagnostics: collect before cleanup, without replacing the migration error.
function diagnostic(label, args) {
  console.log(`::group::Migration diagnostics: ${label}`);
  try {
    const output = runAzure(args, { quiet: true });
    // Prefix external log lines so they cannot be interpreted as Actions commands.
    for (const line of redact(output || "No diagnostics returned.").split(/\r?\n/u)) {
      console.log(`[migration-debug] ${line}`);
    }
    return output;
  } catch (error) {
    console.log(`[migration-debug] Unavailable: ${redact(error.message ?? error)}`);
  } finally {
    console.log("::endgroup::");
  }
}

function collectFailureDiagnostics() {
  const jobArgs = ["--name", jobName, "--resource-group", resourceGroup];
  diagnostic("executions", [
    "containerapp", "job", "execution", "list", ...jobArgs, "--output", "json",
  ]);
  if (executionName) {
    const output = diagnostic("replicas", [
      "containerapp", "job", "replica", "list", ...jobArgs,
      "--execution", executionName, "--output", "json",
    ]);
    const replicas = output ? JSON.parse(output) : [];
    for (const replica of replicas) {
      for (const container of replica.properties?.containers ?? []) {
        diagnostic(`console ${replica.name}/${container.name}`, [
          "containerapp", "job", "logs", "show", ...jobArgs,
          "--execution", executionName, "--replica", replica.name,
          "--container", container.name, "--tail", "300", "--follow", "false",
        ]);
      }
    }
  }
  // Terminated replicas may have no live log stream; try retained console/system logs.
  const workspace = runAzure([
    "containerapp", "env", "show", "--name", environment,
    "--resource-group", resourceGroup,
    "--query", "properties.appLogsConfiguration.logAnalyticsConfiguration.customerId",
    "--output", "tsv",
  ], { quiet: true });
  if (workspace && workspace !== "None") {
    diagnostic("retained console and system logs", [
      "monitor", "log-analytics", "query", "--workspace", workspace,
      "--analytics-query",
      `union isfuzzy=true ContainerAppConsoleLogs_CL, ContainerAppSystemLogs_CL | where TimeGenerated > ago(2h) | where ContainerJobName_s == '${jobName}' | project TimeGenerated, Log=column_ifexists('Log_s', ''), Reason=column_ifexists('Reason_s', '') | order by TimeGenerated asc | take 300`,
      "--output", "json",
    ]);
  } else {
    console.log("[migration-debug] No Log Analytics workspace configured.");
  }
}

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
      executionName = execution.name;
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
  console.error(`[migration-debug] ${redact(error.message ?? error)}`);
  try {
    collectFailureDiagnostics();
  } catch (diagnosticError) {
    console.log(`[migration-debug] Could not collect diagnostics: ${redact(diagnosticError.message ?? diagnosticError)}`);
  }
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
      console.error(`Could not remove temporary migration job ${jobName}: ${redact(message)}`);
      if (!migrationError) migrationError = error;
    }
  }
}

if (migrationError) {
  const message = migrationError instanceof Error ? migrationError.message : String(migrationError);
  console.error(`Blocking API deployment: ${redact(message)}`);
  process.exitCode = 1;
}
