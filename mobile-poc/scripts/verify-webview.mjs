import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(scriptDir, "..");
const fixtureDir = path.resolve(pocRoot, "../web/e2e/fixtures");
const htmlPath = path.join(pocRoot, "assets/parser-webview.html");
const baseline = JSON.parse(
  readFileSync(path.join(pocRoot, "src/baseline.json"), "utf8"),
);
const { transformStatement } = require("../src/generated/statement-parser.js");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function cents(amount) {
  return Math.round(amount * 100);
}

async function runBrowser(browserType) {
  const browser = await browserType.launch();
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), resourceType: request.resourceType() });
  });
  await page.goto(pathToFileURL(htmlPath).href);
  const cases = [];

  for (const [fileName, expected] of Object.entries(baseline.fixtures)) {
    const pdfBase64 = readFileSync(path.join(fixtureDir, fileName)).toString("base64");
    const before = requests.length;
    const result = await page.evaluate(
      async ({ pdfBase64, password }) => {
        const binary = atob(pdfBase64);
        const data = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          data[index] = binary.charCodeAt(index);
        }
        const started = performance.now();
        const extracted = await globalThis.extractStatementPages({
          data,
          password,
        });
        const text = extracted.pages.map((page) => page.text).join("\n");
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text),
        );
        const textSha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        return {
          text,
          textSha256,
          pageCount: extracted.pages.length,
          networkRequests: extracted.networkRequests,
          networkUrls: extracted.networkUrls,
          elapsedMs: Math.round(performance.now() - started),
        };
      },
      { pdfBase64, password: expected.password },
    );
    const during = requests.slice(before);
    const remote = during.filter((request) => /^https?:/i.test(request.url));
    const statement = transformStatement(result.text);
    const mismatches = [];
    if (result.textSha256 !== expected.textSha256) mismatches.push("textSha256");
    if (sha256(result.text) !== expected.textSha256) mismatches.push("nodeHashOfWebViewText");
    if (result.pageCount !== expected.pageCount) mismatches.push("pageCount");
    if (statement.summary.provider !== expected.provider) mismatches.push("provider");
    if (statement.summary.totalTransactions !== expected.transactionCount) {
      mismatches.push("transactionCount");
    }
    if (cents(statement.summary.totalAmountDue) !== expected.totalAmountDueCents) {
      mismatches.push("totalAmountDueCents");
    }
    if (result.networkRequests !== 0) mismatches.push("networkRequests");
    if (remote.length !== 0) mismatches.push("playwrightRemoteRequests");
    cases.push({
      fileName,
      ok: mismatches.length === 0,
      mismatches,
      textSha256: result.textSha256,
      provider: statement.summary.provider,
      transactionCount: statement.summary.totalTransactions,
      totalAmountDueCents: cents(statement.summary.totalAmountDue),
      networkRequests: result.networkRequests,
      remoteRequestCount: remote.length,
      elapsedMs: result.elapsedMs,
    });
  }

  const wrong = await page.evaluate(async (pdfBase64) => {
    const binary = atob(pdfBase64);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      data[index] = binary.charCodeAt(index);
    }
    try {
      await globalThis.extractStatementPages({
        data,
        password: "wrong-password",
      });
      return { code: null, networkRequests: 0 };
    } catch (error) {
      return {
        code: error.code || error.name,
        networkRequests: error.networkRequests ?? null,
      };
    }
  }, readFileSync(path.join(fixtureDir, "spending-journey-encrypted.pdf")).toString("base64"));

  const probeStarted = requests.length;
  const probe = await page.evaluate(async () => {
    try {
      await fetch("https://example.invalid/poc-fetch-probe");
      return { blocked: false, count: globalThis.__pocNetworkEvents.length };
    } catch {
      return { blocked: true, count: globalThis.__pocNetworkEvents.length };
    }
  });
  const probeRemote = requests
    .slice(probeStarted)
    .filter((request) => /^https?:/i.test(request.url));

  await browser.close();
  const ok =
    cases.every((entry) => entry.ok) &&
    wrong.code === "password" &&
    probe.blocked === true &&
    probeRemote.length === 0;
  return {
    browser: browserType.name(),
    ok,
    cases,
    wrongPassword: wrong,
    fetchProbe: { ...probe, playwrightRemoteRequests: probeRemote.length },
    requestUrls: [...new Set(requests.map((request) => request.url))],
  };
}

const browsers = [
  ["chromium", chromium],
  ["webkit", webkit],
];
const results = [];
for (const [name, browserType] of browsers) {
  console.log(`Verifying ${name} from file://`);
  results.push(await runBrowser(browserType));
}

const report = {
  ok: results.every((result) => result.ok),
  results,
};
const artifactDir = "/opt/cursor/artifacts";
mkdirSync(artifactDir, { recursive: true });
const artifactPath = path.join(artifactDir, "webview-verify.json");
writeFileSync(artifactPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  process.exit(1);
}
