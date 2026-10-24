import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const documentationDirectories = [
  "docs/",
  "api/docs/",
  "mobile-app/docs/",
  "web/design/",
  ".agents/skills/",
];

const documentationAssetExtensions = new Set([
  ".adoc",
  ".avif",
  ".csv",
  ".drawio",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mermaid",
  ".mid",
  ".midi",
  ".mmd",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".rst",
  ".svg",
  ".tif",
  ".tiff",
  ".ttf",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const nonDocumentationDirectoryNames = new Set([
  ".devcontainer",
  ".github",
  ".husky",
  ".vscode",
  "__fixtures__",
  "__tests__",
  "android",
  "app",
  "application",
  "applications",
  "apps",
  "automation",
  "build",
  "coverage",
  "cypress",
  "dist",
  "e2e",
  "evals",
  "fixture",
  "fixtures",
  "generated",
  "ios",
  "libs",
  "migrations",
  "node_modules",
  "playwright",
  "schema",
  "schemas",
  "scripts",
  "seed",
  "seeds",
  "source",
  "src",
  "templates",
  "test",
  "tests",
  "vendor",
  "workflows",
]);

const runtimeAssetDirectoryNames = new Set(["asset", "assets", "public", "resource", "resources", "static"]);

const zeroSha = /^0+$/;
const gitSha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

function repositoryPathSegments(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\\")) return undefined;
  if (filePath.startsWith("/")) return undefined;

  const segments = filePath.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) return undefined;
  return segments.map(segment => segment.toLowerCase());
}

export function isDocumentationPath(filePath) {
  const segments = repositoryPathSegments(filePath);
  if (!segments || segments.some(segment => nonDocumentationDirectoryNames.has(segment))) return false;

  const normalizedPath = segments.join("/");
  if (segments[0] === "web" && segments[1] !== "design") return false;

  const isDocumentationLocation = documentationDirectories.some(directory => normalizedPath.startsWith(directory));
  if (!isDocumentationLocation && segments.some(segment => runtimeAssetDirectoryNames.has(segment))) return false;

  const basename = segments.at(-1);
  if (/^(?:license|notice)(?:\.[a-z0-9_-]+)*$/.test(basename)) return true;

  const extension = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")) : "";
  if ([".md", ".mdx", ".pen"].includes(extension)) return true;

  return documentationAssetExtensions.has(extension) && isDocumentationLocation;
}

export function isDocumentationOnly(changedPaths) {
  return changedPaths.length > 0 && changedPaths.every(isDocumentationPath);
}

export function parseNameStatusZ(output) {
  const fields = String(output).split("\0");
  if (fields.at(-1) === "") fields.pop();

  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) throw new Error("Git returned an empty change status.");

    const isRenameOrCopy = /^[RC]\d+$/i.test(status);
    if (!isRenameOrCopy && !/^[ADMTUXB]$/i.test(status)) {
      throw new Error(`Git returned an unsupported change status: ${status}`);
    }

    const pathCount = isRenameOrCopy ? 2 : 1;
    const changed = fields.slice(index, index + pathCount);
    if (changed.length !== pathCount || changed.some(path => !path)) {
      throw new Error(`Git returned incomplete paths for change status: ${status}`);
    }
    paths.push(...changed);
    index += pathCount;
  }

  return paths;
}

function requiredSha(value, label) {
  if (typeof value !== "string" || !gitSha.test(value) || zeroSha.test(value)) {
    throw new Error(`Missing or invalid ${label} commit; run full validation instead of skipping it.`);
  }
  return value;
}

export function comparisonForEvent(eventName, eventPayload) {
  if (eventName === "pull_request") {
    return {
      mode: "merge-base",
      base: requiredSha(eventPayload?.pull_request?.base?.sha, "pull request base"),
      head: requiredSha(eventPayload?.pull_request?.head?.sha, "pull request head"),
    };
  }

  if (eventName === "push") {
    return {
      mode: "direct",
      base: requiredSha(eventPayload?.before, "push before"),
      head: requiredSha(eventPayload?.after, "push after"),
    };
  }

  throw new Error(`Unsupported event for documentation detection: ${eventName}`);
}

function changedPathsForComparison(comparison) {
  const base = comparison.mode === "merge-base"
    ? execFileSync("git", ["merge-base", comparison.base, comparison.head], { encoding: "utf8" }).trim()
    : comparison.base;

  if (!gitSha.test(base)) throw new Error("Git could not find a valid comparison base.");

  const output = execFileSync("git", [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    base,
    comparison.head,
  ], { maxBuffer: 32 * 1024 * 1024 });

  return parseNameStatusZ(output.toString("utf8"));
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!eventPath || !eventName || !outputPath) {
    throw new Error("Documentation detection requires GitHub Actions event and output files.");
  }

  const eventPayload = JSON.parse(readFileSync(eventPath, "utf8"));
  const comparison = comparisonForEvent(eventName, eventPayload);
  const changedPaths = changedPathsForComparison(comparison);
  const documentationOnly = isDocumentationOnly(changedPaths);

  appendFileSync(outputPath, `documentation_only=${documentationOnly}\n`);
  console.log(`documentation_only=${documentationOnly}; classified ${changedPaths.length} changed path(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Unable to classify changes safely: ${error.message}`);
    process.exitCode = 1;
  }
}
