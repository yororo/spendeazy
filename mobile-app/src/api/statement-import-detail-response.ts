import type {
  ConfirmationPayload,
  EvidenceTransaction,
  ConfirmedExpense,
  ImportAdvisoryWarning,
} from "../features/statement-import/confirmation-contract.ts";

export type ImportConfirmation = {
  evidence: Omit<ConfirmationPayload["evidence"], "transactions">;
  includedCount: string;
  excludedCount: string;
  originalExpenseCount: string;
  originalExpenseTotal: string;
  acknowledgedWarnings: ImportAdvisoryWarning[];
  acknowledgedWarningDigest: string | null;
};
export type ImportEvidenceRow = {
  sourceRowId: string;
  disposition: "included" | "excluded";
  originalEvidence: Omit<EvidenceTransaction, "duplicateReference">;
  confirmedValues: ConfirmedExpense | null;
  exclusion: ConfirmationPayload["excluded"][number] | null;
  expense: { id: string; edited: boolean; deletedAt: string | null } | null;
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid object");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string") throw Error("Invalid text");
  return value;
}
export function id(value: unknown): string {
  const s = text(value);
  if (!/^[1-9]\d*$/u.test(s)) throw Error("Invalid ID");
  return s;
}
export function count(value: unknown): string {
  const s = text(value);
  if (!/^(0|[1-9]\d*)$/u.test(s)) throw Error("Invalid count");
  return s;
}
export function amount(value: unknown): string {
  const s = text(value);
  if (!/^(0|[1-9]\d*)\.\d{2}$/u.test(s)) throw Error("Invalid amount");
  return s;
}
function signedAmount(value: unknown): string {
  const s = text(value);
  if (!/^-?(0|[1-9]\d*)\.\d{2}$/u.test(s)) throw Error("Invalid signed amount");
  return s;
}
export function nullable<T>(
  value: unknown,
  read: (value: unknown) => T,
): T | null {
  return value === null ? null : read(value);
}
export function date(value: unknown): string {
  const s = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw Error("Invalid date");
  return s;
}
export function timestamp(value: unknown): string {
  const s = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      s,
    ) ||
    !Number.isFinite(Date.parse(s))
  )
    throw Error("Invalid timestamp");
  date(s.slice(0, 10));
  return s;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw Error("Invalid boolean");
  return value;
}
function index(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid index");
  return value;
}
function array<T>(value: unknown, read: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw Error("Invalid array");
  return value.map(read);
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw Error("Invalid enum");
  return value as T;
}
function hash(value: unknown): string {
  const s = text(value);
  if (!/^[a-f0-9]{64}$/u.test(s)) throw Error("Invalid digest");
  return s;
}
function safeKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw Error("Private or unknown evidence field");
}

export function readConfirmation(value: unknown): ImportConfirmation {
  const c = record(value),
    e = record(c.evidence),
    r = record(e.reconciliation),
    completeness = record(e.completeness);
  safeKeys(c, [
    "evidence",
    "includedCount",
    "excludedCount",
    "originalExpenseCount",
    "originalExpenseTotal",
    "acknowledgedWarnings",
    "acknowledgedWarningDigest",
  ]);
  safeKeys(e, [
    "parserVersion",
    "extractionEngineVersion",
    "controlTotals",
    "reconciliation",
    "pages",
    "completeness",
  ]);
  return {
    includedCount: count(c.includedCount),
    excludedCount: count(c.excludedCount),
    originalExpenseCount: count(c.originalExpenseCount),
    originalExpenseTotal: amount(c.originalExpenseTotal),
    acknowledgedWarningDigest: nullable(c.acknowledgedWarningDigest, hash),
    acknowledgedWarnings: array(c.acknowledgedWarnings, (value) => {
      const w = record(value);
      return {
        id: hash(w.id),
        type: choice(w.type, [
          "reconciliation",
          "exact_file",
          "probable_duplicate",
        ]),
        message: text(w.message),
        sourceRowIds: array(w.sourceRowIds, text),
        expenseIds: array(w.expenseIds, id),
        statementImportIds: array(w.statementImportIds, id),
      };
    }),
    evidence: {
      parserVersion: text(e.parserVersion),
      extractionEngineVersion: text(e.extractionEngineVersion),
      controlTotals: array(e.controlTotals, (value) => {
        const c = record(value);
        return {
          key: text(c.key),
          label: text(c.label),
          originalText: text(c.originalText),
          amount: nullable(c.amount, signedAmount),
        };
      }),
      reconciliation: {
        status: choice(r.status, ["matched", "warning", "unavailable"]),
        comparisons: array(r.comparisons, (value) => {
          const c = record(value);
          return {
            controlKey: nullable(c.controlKey, text),
            equation: text(c.equation),
            expectedAmount: nullable(c.expectedAmount, signedAmount),
            extractedAmount: nullable(c.extractedAmount, signedAmount),
            difference: nullable(c.difference, signedAmount),
          };
        }),
        diagnostics: array(r.diagnostics, (value) => {
          const d = record(value);
          return {
            code: text(d.code),
            message: text(d.message),
            sourceRowIds: array(d.sourceRowIds, text),
            pageIndices: array(d.pageIndices, index),
          };
        }),
      },
      pages: array(e.pages, (value) => {
        const p = record(value);
        return {
          pageIndex: index(p.pageIndex),
          outcome: choice(p.outcome, ["text", "blank", "unreadable", "failed"]),
          hasImages: bool(p.hasImages),
        };
      }),
      completeness: {
        assessment: choice(completeness.assessment, ["uncertain", "partial"]),
        failedPageIndices: array(completeness.failedPageIndices, index),
        unreadablePageIndices: array(completeness.unreadablePageIndices, index),
      },
    },
  };
}
export function readEvidenceRow(value: unknown): ImportEvidenceRow {
  const r = record(value),
    e = record(r.originalEvidence),
    o = record(e.original),
    n = record(e.normalized);
  safeKeys(r, [
    "sourceRowId",
    "disposition",
    "originalEvidence",
    "confirmedValues",
    "exclusion",
    "expense",
  ]);
  safeKeys(e, [
    "sourceRowId",
    "pageIndex",
    "sourceOrder",
    "original",
    "normalized",
    "classification",
    "classificationEvidence",
    "matchingSource",
  ]);
  const result: ImportEvidenceRow = {
    sourceRowId: text(r.sourceRowId),
    disposition: choice(r.disposition, ["included", "excluded"]),
    originalEvidence: {
      sourceRowId: text(e.sourceRowId),
      pageIndex: index(e.pageIndex),
      sourceOrder: index(e.sourceOrder),
      original: {
        dateText: text(o.dateText),
        postingDateText: nullable(o.postingDateText, text),
        description: text(o.description),
        amountText: text(o.amountText),
        balanceText: nullable(o.balanceText, text),
      },
      normalized: {
        date: nullable(n.date, date),
        amount: nullable(n.amount, signedAmount),
      },
      classification: choice(e.classification, [
        "purchase",
        "outgoing_transfer",
        "payment",
        "refund",
        "credit",
        "cash_in",
        "unknown_direction",
        "invalid_date",
        "invalid_amount",
      ]),
      matchingSource: choice(e.matchingSource, [
        "manual",
        "exact",
        "contains",
        "unmapped",
      ]),
      classificationEvidence: array(e.classificationEvidence, (value) => {
        const c = record(value);
        return {
          kind: choice(c.kind, [
            "debit-credit-column",
            "explicit-sign",
            "balance-movement",
            "activity-code",
            "unresolved",
          ]),
          value: nullable(c.value, text),
        };
      }),
    },
    confirmedValues: nullable(r.confirmedValues, (value) => {
      const c = record(value);
      safeKeys(c, [
        "sourceRowId",
        "expenseDate",
        "description",
        "amount",
        "categoryId",
      ]);
      return {
        sourceRowId: text(c.sourceRowId),
        expenseDate: date(c.expenseDate),
        description: text(c.description),
        amount: amount(c.amount),
        categoryId: id(c.categoryId),
      };
    }),
    exclusion: nullable(r.exclusion, (value) => {
      const e = record(value);
      return {
        sourceRowId: text(e.sourceRowId),
        reason: text(e.reason),
        automatic: bool(e.automatic),
      };
    }),
    expense: nullable(r.expense, (value) => {
      const e = record(value);
      return {
        id: id(e.id),
        edited: bool(e.edited),
        deletedAt: nullable(e.deletedAt, timestamp),
      };
    }),
  };
  if (
    !result.sourceRowId ||
    result.sourceRowId !== result.originalEvidence.sourceRowId ||
    (result.disposition === "included"
      ? !result.confirmedValues || result.exclusion !== null
      : result.confirmedValues !== null ||
        !result.exclusion ||
        result.expense !== null) ||
    (result.confirmedValues &&
      result.confirmedValues.sourceRowId !== result.sourceRowId) ||
    (result.exclusion && result.exclusion.sourceRowId !== result.sourceRowId)
  )
    throw Error("Inconsistent evidence row");
  return result;
}
