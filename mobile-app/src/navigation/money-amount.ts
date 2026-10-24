const EXACT_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function displayMoneyAmount(amount: string): string {
  if (!EXACT_DECIMAL.test(amount)) {
    throw new Error('Money amounts must be exact decimal strings');
  }
  return amount;
}
