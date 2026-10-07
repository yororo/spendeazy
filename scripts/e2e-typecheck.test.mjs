import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("strict compiler discovers new specs/helpers, checks Playwright options and emits nothing", () => {
  const web = resolve("web");
  const reports = resolve(web, "e2e-reports");
  mkdirSync(reports, { recursive: true });
  const directory = mkdtempSync(resolve(reports, "typecheck-probe-"));
  try {
    const config = JSON.parse(readFileSync(resolve(web, "tsconfig.e2e.json"), "utf8"));
    writeFileSync(resolve(directory, "tsconfig.json"), JSON.stringify(config));
    mkdirSync(resolve(directory, "e2e/nested"), { recursive: true });
    writeFileSync(resolve(directory, "playwright.config.ts"), 'import { defineConfig } from "@playwright/test"; export default defineConfig({ use: { baseURL: "http://localhost" } });');
    writeFileSync(resolve(directory, "e2e/nested/new.spec.ts"), 'import { test } from "@playwright/test"; test("new", async ({ page }) => { await page.goto("/"); });');
    const helper = resolve(directory, "e2e/nested/new-helper.ts");
    writeFileSync(helper, 'export const value: string = "valid";');
    const compile = () => spawnSync(process.execPath, [resolve(web, "node_modules/typescript/bin/tsc"), "--project", resolve(directory, "tsconfig.json")], {
      encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 30000,
    });
    const valid = compile();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    assert.deepEqual(readdirSync(resolve(directory, "e2e/nested")).sort(), ["new-helper.ts", "new.spec.ts"]);
    writeFileSync(helper, 'const value: unknown = "untrusted"; export const text: string = value;');
    const unknown = compile();
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stdout, /new-helper.ts.*TS2322/);
    writeFileSync(helper, 'export const value: string = "valid";');
    writeFileSync(resolve(directory, "playwright.config.ts"), 'import { defineConfig } from "@playwright/test"; export default defineConfig({ use: { unsupportedOption: true } });');
    const option = compile();
    assert.notEqual(option.status, 0);
    assert.match(option.stdout, /unsupportedOption/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
