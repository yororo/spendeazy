/** Version 1 reviewed JSON. Text is restricted to individual row/control fields. */
export interface ConfirmationPayload {
  statement: {
    fileName: string; fileHash: string; provider: 'bdo' | 'eastwest' | 'gcash';
    accountFormat: 'amex' | 'visa' | 'wallet'; statementType: 'credit_card' | 'e_wallet';
    statementDate: string | null; historyFromDate: string | null; historyToDate: string | null;
  };
  evidence: {
    parserVersion: string; extractionEngineVersion: string;
    transactions: EvidenceTransaction[];
    controlTotals: { key: string; label: string; originalText: string; amount: string | null }[];
    reconciliation: {
      status: 'matched' | 'warning' | 'unavailable';
      comparisons: { controlKey: string | null; equation: string; expectedAmount: string | null; extractedAmount: string | null; difference: string | null }[];
      diagnostics: { code: string; message: string; sourceRowIds: string[]; pageIndices: number[] }[];
    };
    pages: { pageIndex: number; outcome: 'text' | 'blank' | 'unreadable' | 'failed'; hasImages: boolean }[];
    completeness: { assessment: 'uncertain' | 'partial'; failedPageIndices: number[]; unreadablePageIndices: number[] };
  };
  expenses: ConfirmedExpense[];
  excluded: { sourceRowId: string; reason: string; automatic: boolean }[];
  rememberedRules: { pattern: string; matchType: 'exact' | 'contains'; categoryId: string }[];
  acknowledgedWarnings: string[];
  acknowledgedWarningDigest: string | null;
}

export interface EvidenceTransaction {
  sourceRowId: string; pageIndex: number; sourceOrder: number;
  original: { dateText: string; postingDateText: string | null; description: string; amountText: string; balanceText: string | null };
  normalized: { date: string | null; amount: string | null };
  /** Locked unresolved classifications extend the accepted six financial classes. */
  classification: 'purchase' | 'outgoing_transfer' | 'payment' | 'refund' | 'credit' | 'cash_in' | 'unknown_direction' | 'invalid_date' | 'invalid_amount';
  classificationEvidence: { kind: 'debit-credit-column' | 'explicit-sign' | 'balance-movement' | 'activity-code' | 'unresolved'; value: string | null }[];
  matchingSource: 'manual' | 'exact' | 'contains' | 'unmapped';
  /** Ephemeral input only: replace with scoped HMAC before hashing/persistence. */
  duplicateReference?: string;
}

export interface ConfirmedExpense {
  sourceRowId: string; expenseDate: string; description: string; amount: string; categoryId: string;
}

export interface ImportAdvisoryWarning {
  id: string; type: 'reconciliation' | 'exact_file' | 'probable_duplicate';
  sourceRowIds: string[]; expenseIds: string[]; statementImportIds: string[]; message: string;
}

export interface CommittedImportResult {
  status: 'committed'; operationId: string; statementImportId: string; confirmedAt: string;
  originalExpenseCount: string; originalExpenseTotal: string;
}

export type PrivateConfirmationPayload = Omit<ConfirmationPayload, 'evidence'> & {
  evidence: Omit<ConfirmationPayload['evidence'], 'transactions'> & {
    transactions: (Omit<EvidenceTransaction, 'duplicateReference'> & { referenceHash: string | null })[];
  };
};
