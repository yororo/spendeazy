import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PasswordException, PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(scriptDir, "..");
const fixtureDir = path.resolve(pocRoot, "../web/e2e/fixtures");
const { transformStatement } = require("../src/generated/statement-parser.js");

const fixtures = [
  {
    fileName: "spending-journey.pdf",
    password: undefined,
  },
  {
    fileName: "spending-journey-encrypted.pdf",
    password: "fictional-journey-only",
  },
];

async function extractJoinedText(filePath, password) {
  const data = new Uint8Array(readFileSync(filePath));
  const parser = new PDFParse({
    data,
    password,
    stopAtErrors: true,
  });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const text = result.pages.map((page) => page.text).join("\n");
    return { text, pageCount: result.pages.length };
  } finally {
    await parser.destroy();
  }
}

function moneyToCents(amount) {
  return Math.round(amount * 100);
}

const output = {
  pdfParse: "2.4.5",
  pdfjsDist: "5.4.296",
  pipeline:
    "Node pdf-parse PDFParse.getText({ pageJoiner: '' }); pages joined with a single newline, matching statement-categorizer.ts; then transformStatement from the shared parser bundle.",
  wrongPasswordCode: "password",
  fixtures: {},
};

for (const fixture of fixtures) {
  const filePath = path.join(fixtureDir, fixture.fileName);
  const extracted = await extractJoinedText(filePath, fixture.password);
  const statement = transformStatement(extracted.text);
  output.fixtures[fixture.fileName] = {
    password: fixture.password ?? null,
    textSha256: createHash("sha256").update(extracted.text, "utf8").digest("hex"),
    textLength: extracted.text.length,
    pageCount: extracted.pageCount,
    provider: statement.summary.provider,
    statementType: statement.summary.statementType,
    transactionCount: statement.summary.totalTransactions,
    totalAmountDueCents: moneyToCents(statement.summary.totalAmountDue),
  };
  console.log(
    `${fixture.fileName}: ${output.fixtures[fixture.fileName].provider} ${output.fixtures[fixture.fileName].transactionCount} tx ${output.fixtures[fixture.fileName].totalAmountDueCents} cents ${output.fixtures[fixture.fileName].textSha256}`,
  );
}

const encryptedPath = path.join(fixtureDir, "spending-journey-encrypted.pdf");
try {
  await extractJoinedText(encryptedPath, "wrong-password");
  throw new Error("Encrypted fixture unlocked with the wrong password.");
} catch (error) {
  if (!(error instanceof PasswordException) && error?.name !== "PasswordException") {
    throw error;
  }
}

const destination = path.join(pocRoot, "src/baseline.json");
writeFileSync(destination, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${destination}`);
