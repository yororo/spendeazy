import { DOMAIN_DATE_PATTERN } from './validation-patterns';

export function isValidDomainDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DOMAIN_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

export function daysInMonth(year: number, month: number): number {
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return days[month - 1] ?? 0;
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}
