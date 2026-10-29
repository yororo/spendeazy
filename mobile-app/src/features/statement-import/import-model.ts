/** Local #152 boundary. No PDF bytes, passwords, raw page text or geometry. */
export type ImportOwner = Readonly<{ userId: string; spaceId: string }>;
export type ImportFile = Readonly<{ name: string; byteCount: number; sha256: string }>;
/** YYYY-MM-DD, validated by the interpretation adapter; never converted to Date. */
export type DateOnly = string;
/** Signed base-10 integer minor units (PHP centavos), with no floating point conversion. */
export type MinorUnits = bigint;
/** Exact decimal string at serialization boundaries, e.g. "1000.00". */
export type DecimalAmount = string;
export type ImportAccount =
  | Readonly<{ provider: 'bdo'; format: 'amex'; statementType: 'credit-card' }>
  | Readonly<{ provider: 'eastwest'; format: 'visa'; statementType: 'credit-card' }>
  | Readonly<{ provider: 'gcash'; format: 'e-wallet'; statementType: 'e-wallet' }>;
export type ClassificationEvidence = Readonly<{
  kind: 'debit-credit-column' | 'explicit-sign' | 'balance-movement' | 'activity-code' | 'unresolved';
  value: string | null;
}>;
export type ImportRow = Readonly<{
  /** Deterministic original page/engine-order identity, never description deduplication. */
  sourceRowId: string;
  pageIndex: number;
  sourceOrder: number;
  description: string;
  originalDate: string;
  originalPostingDate?: string;
  date: DateOnly | null;
  reference: string | null;
  originalAmount: string;
  originalBalance?: string;
  /** Positive = outgoing; negative = incoming; null = unresolved direction. */
  signedActivityMinor: MinorUnits | null;
  evidence: readonly ClassificationEvidence[];
  classification:
    | Readonly<{ eligible: true; kind: 'purchase' | 'outgoing-transfer'; expenseMinor: MinorUnits }>
    | Readonly<{ eligible: false; reason: 'payment' | 'refund' | 'credit' | 'cash-in' | 'unknown-direction' | 'invalid-date' | 'invalid-amount' }>;
}>;
export type PageOutcome = Readonly<{
  /** Zero-based source page index, preserving PDF engine stream order. */
  pageIndex: number;
  outcome: 'text' | 'blank' | 'unreadable' | 'failed';
  hasImages: boolean;
}>;
export type ImportWarning = Readonly<{
  code: 'partial-extraction' | 'uncertain-completeness' | 'unresolved-classification' | 'reconciliation-mismatch' | 'missing-control';
  sourceRowIds: readonly string[];
  pageIndices: readonly number[];
}>;
export type ImportControl = Readonly<{
  kind: 'opening-balance' | 'closing-balance' | 'total-debits' | 'total-credits' | 'statement-total' | 'component' | 'subtotal';
  sourceLabel?: string;
  originalValue: string;
  amountMinor: MinorUnits | null;
}>;
export type ImportResult = Readonly<{
  draftId: string;
  owner: ImportOwner;
  file: ImportFile;
  account: ImportAccount;
  dates: Readonly<{ statementDate: DateOnly | null; historyPeriod: Readonly<{ from: DateOnly; to: DateOnly }> | null }>;
  controls: readonly ImportControl[];
  rows: readonly ImportRow[];
  pages: readonly PageOutcome[];
  completeness: Readonly<{
    assessment: 'uncertain' | 'partial';
    failedPageIndices: readonly number[];
    unreadablePageIndices: readonly number[];
  }>;
  recognitionEvidence: readonly Readonly<{ kind: 'provider' | 'account-format'; value: string }>[];
  reconciliation: Readonly<{ outcome: 'matched' | 'mismatch' | 'unavailable'; differenceMinor: MinorUnits | null }>;
  warnings: readonly ImportWarning[];
}>;
