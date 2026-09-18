const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/u;

export function normalizeMoney(value: string): string {
  return formatCents(toCents(value));
}

export function subtractMoney(left: string, right: string): string {
  return formatCents(toCents(left) - toCents(right));
}

function toCents(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error('Money values must contain at most two decimal places');
  }

  const isNegative = value.startsWith('-');
  const unsignedValue = isNegative ? value.slice(1) : value;
  const [wholeUnits, fractionalUnits = ''] = unsignedValue.split('.');
  const cents =
    BigInt(wholeUnits) * 100n + BigInt(fractionalUnits.padEnd(2, '0'));

  return isNegative ? -cents : cents;
}

function formatCents(cents: bigint): string {
  const isNegative = cents < 0n;
  const absoluteCents = isNegative ? -cents : cents;
  const wholeUnits = absoluteCents / 100n;
  const fractionalUnits = (absoluteCents % 100n).toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${wholeUnits.toString()}.${fractionalUnits}`;
}
