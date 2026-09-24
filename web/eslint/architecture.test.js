import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const eslint = new ESLint({ cwd: projectRoot });

// Loading TypeScript and the lint plugins is suite setup, not a fixture's work.
beforeAll(async () => {
  await eslint.calculateConfigForFile(path.join(projectRoot, "src/App.tsx"));
}, 30_000);

async function violations(file, code) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(projectRoot, file),
  });
  expect(result.messages.filter((message) => message.fatal)).toEqual([]);
  return result.messages
    .filter((message) => message.ruleId === "architecture/dependencies")
    .map((message) => message.messageId);
}

describe("architectural dependency enforcement", () => {
  it.each([
    ["src/App.tsx", 'import { DashboardPage } from "@/features/dashboard";'],
    ["src/App.tsx", 'const page = import("@/features/dashboard");'],
    ["src/features/dashboard/dashboard-page.tsx", 'import { read } from "./dashboard-service";'],
    ["src/features/dashboard/nested/view.tsx", 'export { read } from "../dashboard-service";'],
    ["src/features/dashboard/dashboard-page.test.tsx", 'import { read } from "./dashboard-service";'],
    ["src/features/dashboard/dashboard-page.tsx", 'import { FeatureDataError } from "@/shared/ui/feature-data-state";'],
    ["src/shared/ui/view.tsx", 'import { Button } from "@/components/ui/button";'],
    ["src/features/dashboard/dashboard-page.test.tsx", 'import fixture from "../../../docs/fixtures/sample.json";'],
  ])("allows %s: %s", async (file, code) => {
    expect(await violations(file, code)).toEqual([]);
  });

  it.each([
    ['import { value } from "TARGET";'],
    ['export { value } from "TARGET";'],
    ['export * from "TARGET";'],
    ['const value = import("TARGET");'],
    ['const value = import(`TARGET`);'],
    ['type Value = import("TARGET").Value;'],
  ])("checks dependency paths in %s", async (syntax) => {
    for (const target of ["@/features/categories", "../categories/categories-service"]) {
      expect(await violations(
        "src/features/dashboard/dashboard-page.tsx",
        syntax.replace("TARGET", target),
      )).toEqual(["feature"]);
    }
  });

  it.each([
    ["src/App.tsx", "@/features/dashboard/dashboard-page", "root"],
    ["src/App.tsx", "./features/dashboard", "root"],
    ["src/App.tsx", "@/features/dashboard/index.ts", "root"],
    ["e2e/example.spec.ts", "../src/features/dashboard/dashboard-page", "root"],
    ["src/shared/query/query.ts", "../../features/dashboard", "feature"],
    ["src/shared/query/query.ts", "@/features/dashboard", "feature"],
    ["src/features/dashboard/dashboard-page.tsx", "@/features/dashboard/dashboard-service", "local"],
    ["src/features/dashboard/dashboard-page.tsx", "@/components/app/authenticated-route", "composition"],
    ["src/shared/ui/view.tsx", "../../components/app/authenticated-route", "composition"],
    ["src/features/dashboard/dashboard-page.tsx", "../../layouts/app-shell", "composition"],
    ["src/shared/ui/view.tsx", "@/pages/not-found-page", "composition"],
    ["src/features/dashboard/dashboard-page.tsx", "../../App", "composition"],
    ["src/shared/ui/view.tsx", "../../main.tsx", "composition"],
    ["src/features/dashboard/dashboard-page.tsx", "@/shared/../features/categories", "feature"],
  ])("rejects %s → %s", async (file, target, messageId) => {
    expect(await violations(file, `export * from "${target}";`)).toEqual([messageId]);
  });
});
