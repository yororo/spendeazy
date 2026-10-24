import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  comparisonForEvent,
  isDocumentationOnly,
  isDocumentationPath,
  parseNameStatusZ,
} from "./documentation-changes.mjs";

const deployWorkflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");

function workflowJob(source, jobName) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(line => line === `  ${jobName}:`);
  assert.notEqual(start, -1, `workflow job ${jobName} exists`);
  const end = lines.findIndex((line, index) => index > start && /^  [A-Za-z_][\w-]*:\s*$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

test("Markdown, agent guidance, legal files, Pencil designs, and documentation references are documentation", () => {
  const documentationPaths = [
    "README.md",
    "mobile-app/AGENTS.md",
    ".agents/skills/clerk/SKILL.md",
    "docs/guide.mdx",
    "docs/adr/0001-decision.md",
    "api/docs/CODING_STANDARDS.md",
    "mobile-app/docs/CODING_STANDARDS.md",
    "web/design/ui-design.pen",
    "web/design/fonts/spendeazy.woff2",
    "docs/architecture.svg",
    "docs/reference.pdf",
    "LICENSE",
    "NOTICE.txt",
  ];

  for (const path of documentationPaths) assert.equal(isDocumentationPath(path), true, path);
});

test("source, tests, workflows, API contracts, and unknown files never qualify as documentation", () => {
  const nonDocumentationPaths = [
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
    "api/src/README.md",
    "mobile-app/app/README.md",
    "mobile-app/src/README.md",
    "mobile-app/assets/parser-reference.md",
    "mobile-app/assets/logo.png",
    "api/test/fixtures/expected-response.md",
    "docs/tests/parser-fixture.md",
    "docs/scripts/build.mjs",
    "docs/styles/theme.css",
    "docs/config.json",
    "api/docs/openapi.json",
    "api/docs/openapi.yaml",
    "docs/schemas/statement.md",
    "docs/seeds/example.md",
    "api/package-lock.json",
    "mobile-app/tsconfig.json",
    "web/README.md",
    "web/src/README.md",
    "docs/unknown.xyz",
  ];

  for (const path of nonDocumentationPaths) assert.equal(isDocumentationPath(path), false, path);
});

test("only non-empty change sets made entirely of documentation skip validation", () => {
  assert.equal(isDocumentationOnly(["README.md", "docs/diagram.svg"]), true);
  assert.equal(isDocumentationOnly(["README.md", "api/src/main.ts"]), false);
  assert.equal(isDocumentationOnly(["unknown.file"]), false);
  assert.equal(isDocumentationOnly([]), false);
});

test("NUL-delimited Git name-status output preserves both sides of renames and deletions", () => {
  const paths = parseNameStatusZ(
    "R100\0api/src/handler.ts\0docs/handler.md\0D\0docs/old-guide.md\0M\0README.md\0",
  );

  assert.deepEqual(paths, [
    "api/src/handler.ts",
    "docs/handler.md",
    "docs/old-guide.md",
    "README.md",
  ]);
  assert.equal(isDocumentationOnly(paths), false);
  assert.equal(isDocumentationOnly(parseNameStatusZ("D\0docs/old-guide.md\0")), true);
  assert.equal(isDocumentationOnly(parseNameStatusZ("D\0api/src/old-handler.ts\0")), false);
});

test("comparison selection uses the complete PR base/head pair and exact push before/after pair", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);

  assert.deepEqual(comparisonForEvent("pull_request", {
    pull_request: { base: { sha: base }, head: { sha: head } },
  }), { mode: "merge-base", base, head });
  assert.deepEqual(comparisonForEvent("push", { before: base, after: head }), {
    mode: "direct",
    base,
    head,
  });
});

test("missing comparison history fails closed so the workflow can run full validation", () => {
  const head = "b".repeat(40);

  assert.throws(() => comparisonForEvent("push", { before: "0".repeat(40), after: head }));
  assert.throws(() => comparisonForEvent("push", { after: head }));
  assert.throws(() => comparisonForEvent("pull_request", { pull_request: { head: { sha: head } } }));
  assert.throws(() => comparisonForEvent("workflow_dispatch", {}));
  assert.throws(() => parseNameStatusZ("M\0"));
});

test("automatic documentation runs skip full validation only after successful classification", () => {
  const detector = workflowJob(deployWorkflow, "detect_changes");
  const validation = workflowJob(deployWorkflow, "validate");

  assert.match(detector, /if: github\.event_name == 'pull_request' \|\| github\.event_name == 'push'/);
  assert.match(detector, /fetch-depth: 0/);
  assert.match(detector, /documentation_only: \$\{\{ steps\.classify\.outputs\.documentation_only \}\}/);
  assert.match(validation, /always\(\)[\s\S]*github\.event_name == 'workflow_dispatch'/);
  assert.match(validation, /needs\.detect_changes\.result != 'success'/);
  assert.match(validation, /needs\.detect_changes\.outputs\.documentation_only != 'true'/);
  assert.match(validation, /uses: \.\/\.github\/workflows\/ci\.yml/);
});

test("the required check completes on documentation-only changes and publication still requires validation", () => {
  const gate = workflowJob(deployWorkflow, "gate");
  const publish = workflowJob(deployWorkflow, "publish");

  assert.match(gate, /name: Validate API, PostgreSQL and mobile/);
  assert.match(gate, /needs: \[detect_changes, validate\]/);
  assert.match(gate, /if: always\(\)/);
  assert.match(gate, /\[ "\$DETECTION_RESULT" = success \] && \[ "\$DOCUMENTATION_ONLY" = true \]/);
  assert.match(gate, /test "\$VALIDATION_RESULT" = success/);
  assert.match(publish, /needs: \[validate, gate\]/);
  assert.match(publish, /needs\.validate\.result == 'success'/);
});

test("manual verification keeps full validation and its deliberate failure controls", () => {
  const validation = workflowJob(deployWorkflow, "validate");
  const publish = workflowJob(deployWorkflow, "publish");

  assert.match(validation, /github\.event_name == 'workflow_dispatch'/);
  assert.match(validation, /force_failure: \$\{\{ inputs\.verify_only == true && inputs\.fail_validation == true \}\}/);
  assert.match(publish, /verify_only: \$\{\{ inputs\.verify_only == true \}\}/);
});
