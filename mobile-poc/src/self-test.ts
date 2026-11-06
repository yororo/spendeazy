import baseline from "./baseline.json";
import { bundledFixtures, readBundledFixture } from "./fixtures";
import type { StatementParseResult } from "./parse-statement";

export interface SelfTestCase {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface SelfTestReport {
  readonly ok: boolean;
  readonly cases: readonly SelfTestCase[];
  readonly networkRequests: number;
}

interface ParseBytes {
  (
    bytes: Uint8Array,
    password: string | undefined,
    label: string,
  ): Promise<StatementParseResult>;
}

function matchesBaseline(
  fileName: string,
  result: StatementParseResult,
): string | null {
  const expected = baseline.fixtures[fileName as keyof typeof baseline.fixtures];
  if (result.errorCode) return `error ${result.errorCode}`;
  if (result.textSha256 !== expected.textSha256) return "text SHA-256 differs";
  if (result.provider !== expected.provider) return "provider differs";
  if (result.transactionCount !== expected.transactionCount) {
    return "transaction count differs";
  }
  if (result.totalAmountDueCents !== expected.totalAmountDueCents) {
    return "total differs";
  }
  if (result.networkRequests !== 0) return "network requests during parse";
  return null;
}

export async function runSelfTest(
  parseBytes: ParseBytes,
  probes: {
    readonly probeFetch: () => Promise<{ blocked: boolean; networkRequests: number }>;
    readonly probeNavigation: () => Promise<boolean>;
  },
): Promise<SelfTestReport> {
  const cases: SelfTestCase[] = [];
  let networkRequests = 0;

  for (const fixture of bundledFixtures) {
    const bytes = await readBundledFixture(fixture);
    const result = await parseBytes(
      bytes,
      fixture.password ?? undefined,
      fixture.fileName,
    );
    networkRequests += result.networkRequests;
    const mismatch = matchesBaseline(fixture.fileName, result);
    cases.push({
      name: fixture.fileName,
      ok: mismatch == null,
      detail: mismatch ?? `${result.provider} ${result.transactionCount} tx ${result.textSha256}`,
    });
  }

  const encrypted = bundledFixtures[1];
  const wrong = await parseBytes(
    await readBundledFixture(encrypted),
    "wrong-password",
    "wrong-password",
  );
  networkRequests += wrong.networkRequests;
  const wrongOk =
    wrong.errorCode === baseline.wrongPasswordCode && wrong.networkRequests === 0;
  cases.push({
    name: "wrong password",
    ok: wrongOk,
    detail: wrongOk
      ? `error code ${wrong.errorCode}`
      : `expected ${baseline.wrongPasswordCode}, got ${wrong.errorCode ?? "none"}`,
  });

  const fetchProbe = await probes.probeFetch();
  cases.push({
    name: "fetch guard",
    ok: fetchProbe.blocked && fetchProbe.networkRequests > 0,
    detail: fetchProbe.blocked
      ? "blocked inside the page"
      : "page allowed a remote fetch",
  });

  const navigationBlocked = await probes.probeNavigation();
  cases.push({
    name: "navigation guard",
    ok: navigationBlocked,
    detail: navigationBlocked
      ? "onShouldStartLoadWithRequest blocked https"
      : "navigation was not blocked",
  });

  const report = {
    ok: cases.every((entry) => entry.ok),
    cases,
    networkRequests,
  };
  console.log(`POC_SELF_TEST ${JSON.stringify(report)}`);
  return report;
}
