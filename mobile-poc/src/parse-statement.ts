import * as Crypto from "expo-crypto";

import {
  StatementTransformationError,
  transformStatement,
} from "./generated/statement-parser";

export interface ExtractedPage {
  readonly num: number;
  readonly text: string;
}

export interface StatementParseResult {
  readonly provider: string | null;
  readonly transactionCount: number | null;
  readonly totalAmountDueCents: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly textSha256: string | null;
  readonly pageCount: number;
  readonly elapsedMs: number;
  readonly networkRequests: number;
  readonly networkUrls: readonly string[];
}

export function joinStatementPages(pages: readonly ExtractedPage[]): string {
  return pages.map((page) => page.text).join("\n");
}

export function formatPhpFromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const major = String(Math.trunc(absolute / 100));
  const minor = String(absolute % 100).padStart(2, "0");
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}₱${grouped}.${minor}`;
}

export async function interpretExtractedPages(
  pages: readonly ExtractedPage[],
  elapsedMs: number,
  networkRequests: number,
  networkUrls: readonly string[],
): Promise<StatementParseResult> {
  const text = joinStatementPages(pages);
  const textSha256 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    text,
  );
  if (!pages.some((page) => page.text.trim().length > 0)) {
    return {
      provider: null,
      transactionCount: null,
      totalAmountDueCents: null,
      errorCode: "unreadable",
      errorMessage: "PDF does not contain extractable text.",
      textSha256,
      pageCount: pages.length,
      elapsedMs,
      networkRequests,
      networkUrls,
    };
  }

  try {
    const statement = transformStatement(text);
    return {
      provider: statement.summary.provider,
      transactionCount: statement.summary.totalTransactions,
      totalAmountDueCents: Math.round(statement.summary.totalAmountDue * 100),
      errorCode: null,
      errorMessage: null,
      textSha256,
      pageCount: pages.length,
      elapsedMs,
      networkRequests,
      networkUrls,
    };
  } catch (error) {
    const errorCode =
      error instanceof StatementTransformationError
        ? error.code
        : "unreadable";
    const errorMessage =
      error instanceof Error ? error.message : "Unable to parse statement.";
    return {
      provider: null,
      transactionCount: null,
      totalAmountDueCents: null,
      errorCode,
      errorMessage,
      textSha256,
      pageCount: pages.length,
      elapsedMs,
      networkRequests,
      networkUrls,
    };
  }
}
