export function normalizeAmount(amount: string): string {
  const [wholeUnits, fractionalUnits] = amount.split('.');
  return `${BigInt(wholeUnits).toString()}.${fractionalUnits}`;
}
