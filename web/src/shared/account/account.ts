import { isRecord } from "../api/api-response";
import { isAbortError, type ApiGetClient } from "../api/api-client";

interface AccountTransactionReference {
  readonly id: string;
  readonly source: "manual" | "imported";
  readonly statementImportId: string | null;
}

interface StatementImportAccount {
  readonly id: string;
  readonly bank: string;
  readonly cardType: string | null;
}

interface TransactionAccount {
  readonly key: string;
  readonly label: string;
}

interface AccountOption extends TransactionAccount {
  readonly bank: string | null;
  readonly cardType: string | null;
}

class AccountResolutionError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AccountResolutionError";
  }
}

const CASH_ACCOUNT_KEY = "manual:cash";

function requireStatementImport(
  response: unknown,
  statementImportId: string,
): StatementImportAccount {
  if (
    !isRecord(response) ||
    typeof response.id !== "string" ||
    response.id !== statementImportId ||
    typeof response.bank !== "string" ||
    response.bank.trim().length === 0 ||
    (response.cardType !== null && typeof response.cardType !== "string")
  ) {
    throw new AccountResolutionError(
      `Statement Import ${statementImportId} returned invalid account metadata.`,
    );
  }

  return {
    id: response.id,
    bank: response.bank,
    cardType: response.cardType,
  };
}

function getStatementImportId(transaction: AccountTransactionReference) {
  if (!transaction.statementImportId) {
    throw new AccountResolutionError(
      `Imported Transaction ${transaction.id} is missing its Statement Import ID.`,
    );
  }

  return transaction.statementImportId;
}

function getStatementImportIds(
  transactions: readonly AccountTransactionReference[],
) {
  const statementImportIds = new Set<string>();

  transactions.forEach((transaction) => {
    if (transaction.source === "imported") {
      statementImportIds.add(getStatementImportId(transaction));
    }
  });

  return statementImportIds;
}

async function loadStatementImport(
  apiClient: ApiGetClient,
  statementImportId: string,
  signal?: AbortSignal,
  spaceId?: string,
) {
  try {
    const collectionPath =
      spaceId === undefined
        ? "/statement-imports"
        : `/spaces/${encodeURIComponent(spaceId)}/statement-imports`;
    const response = await apiClient.get<StatementImportAccount>(
      `${collectionPath}/${encodeURIComponent(statementImportId)}`,
      { signal },
    );

    if (response === undefined) {
      throw new AccountResolutionError(
        `Unable to load Statement Import ${statementImportId}.`,
      );
    }

    return requireStatementImport(response, statementImportId);
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (cause instanceof AccountResolutionError) throw cause;

    throw new AccountResolutionError(
      `Unable to load Statement Import ${statementImportId}.`,
      cause,
    );
  }
}

async function loadStatementImports(
  apiClient: ApiGetClient,
  transactions: readonly AccountTransactionReference[],
  signal?: AbortSignal,
  spaceId?: string,
) {
  const entries = await Promise.all(
    [...getStatementImportIds(transactions)].map(
      async (statementImportId) =>
        [
          statementImportId,
          await loadStatementImport(
            apiClient,
            statementImportId,
            signal,
            spaceId,
          ),
        ] as const,
    ),
  );

  return new Map(entries);
}

function normalizeAccountPart(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function getAccountKey(statementImport: StatementImportAccount) {
  return [
    normalizeAccountPart(statementImport.bank),
    normalizeAccountPart(statementImport.cardType),
  ].join("\u0000");
}

function formatAccount(statementImport: StatementImportAccount) {
  return [statementImport.bank.trim(), statementImport.cardType?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" \u00b7 ");
}

function resolveTransactionAccount(
  transaction: AccountTransactionReference,
  statementImports: ReadonlyMap<string, StatementImportAccount>,
): TransactionAccount {
  if (transaction.source === "manual") {
    return { key: CASH_ACCOUNT_KEY, label: "Cash" };
  }

  if (transaction.source !== "imported") {
    throw new AccountResolutionError(
      `Transaction ${transaction.id} has an unsupported source.`,
    );
  }

  const statementImportId = getStatementImportId(transaction);
  const statementImport = statementImports.get(statementImportId);
  if (!statementImport) {
    throw new AccountResolutionError(
      `Transaction ${transaction.id} references unavailable Statement Import ${statementImportId}.`,
    );
  }

  return {
    key: getAccountKey(statementImport),
    label: formatAccount(statementImport),
  };
}

function countDistinctAccounts(
  transactions: readonly AccountTransactionReference[],
  statementImports: ReadonlyMap<string, StatementImportAccount>,
) {
  return new Set(
    transactions.map(
      (transaction) =>
        resolveTransactionAccount(transaction, statementImports).key,
    ),
  ).size;
}

async function loadAvailableAccounts(
  apiClient: ApiGetClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly AccountOption[]> {
  const collectionPath = spaceId === undefined
    ? "/statement-imports"
    : `/spaces/${encodeURIComponent(spaceId)}/statement-imports`;
  const accounts = new Map<string, AccountOption>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URLSearchParams({ pageSize: "100" });
    if (cursor) url.set("cursor", cursor);
    const response = await apiClient.get<unknown>(`${collectionPath}?${url}`, { signal });
    if (!isRecord(response) || !Array.isArray(response.items) ||
        (response.nextCursor !== null && typeof response.nextCursor !== "string")) {
      throw new AccountResolutionError("Unable to list Accounts.");
    }
    for (const item of response.items) {
      if (!isRecord(item) || typeof item.bank !== "string" ||
          (item.cardType !== null && typeof item.cardType !== "string")) {
        throw new AccountResolutionError("Unable to list Accounts.");
      }
      const account = { id: "", bank: item.bank, cardType: item.cardType };
      const key = `${encodeURIComponent(normalizeAccountPart(account.bank))}:${encodeURIComponent(normalizeAccountPart(account.cardType))}`;
      accounts.set(key, { key, label: formatAccount(account), bank: account.bank, cardType: account.cardType });
    }
    cursor = response.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw new AccountResolutionError("Account list repeated a page.");
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  return [
    { key: CASH_ACCOUNT_KEY, label: "Cash", bank: null, cardType: null },
    ...[...accounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

export {
  AccountResolutionError,
  countDistinctAccounts,
  loadStatementImports,
  loadAvailableAccounts,
  resolveTransactionAccount,
};
export type {
  AccountTransactionReference,
  StatementImportAccount,
  TransactionAccount,
  AccountOption,
};
