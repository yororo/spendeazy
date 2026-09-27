export const STATEMENT_TYPES = ['credit_card', 'e_wallet'] as const;

export type StatementType = (typeof STATEMENT_TYPES)[number];

export function isStatementType(value: unknown): value is StatementType {
  return (
    typeof value === 'string' &&
    STATEMENT_TYPES.includes(value as StatementType)
  );
}

export function isEWalletProvider(provider: string): boolean {
  const normalized = provider.trim().toLocaleLowerCase();
  return normalized === 'gcash' || normalized === 'gcash e-wallet';
}
