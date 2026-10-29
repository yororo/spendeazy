export const MONEY = '(?:[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}(?:\\s*CR)?|\\((?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}\\))';
export function minorUnits(original: string): bigint | null {
  const value = original.trim();
  if (!new RegExp(`^${MONEY}$`, 'iu').test(value)) return null;
  const negative = /^[-(]/u.test(value) || /CR$/iu.test(value);
  const digits = value.replace(/CR|[,+()\s-]/giu, '');
  const [whole, fraction] = digits.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction);
  return negative ? -amount : amount;
}
export function decimalAmount(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
export function dateOnly(year: number, month: number, day: number): string | null {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || !Number.isInteger(day) || day < 1 || day > (days[month - 1] ?? 0)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function parseDate(value: string): string | null {
  let match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match) return dateOnly(+match[1], +match[2], +match[3]);
  match = /^(\d{2})\/(\d{2})\/(\d{2})$/u.exec(value);
  if (match) return dateOnly(2000 + +match[3], +match[1], +match[2]);
  match = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/iu.exec(value);
  if (!match) return null;
  const month = match[1].toLowerCase();
  const index = month.length === 3 ? months.indexOf(month) : fullMonths.indexOf(month);
  return dateOnly(+match[3], index + 1, +match[2]);
}
export function cardDate(value: string, statementDate: string | null): string | null {
  if (!statementDate) return null;
  const match = /^([a-z]{3})\s+(\d{1,2})$/iu.exec(value);
  if (!match) return null;
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  const year = +statementDate.slice(0, 4) - (month > +statementDate.slice(5, 7) ? 1 : 0);
  // Do not search centuries backwards for a matching leap day.
  const candidate = dateOnly(year, month, +match[2]);
  return candidate && candidate <= statementDate ? candidate : null;
}
