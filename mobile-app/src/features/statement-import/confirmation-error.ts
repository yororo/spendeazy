import { ExpenseApiError, requestFailureMessage } from '../../api/request-failure.ts';
import type { ReviewHandoff } from './review-model.ts';

const words = (value: string) => value.replace(/([a-z])([A-Z])/gu, (_, before: string, after: string) => `${before} ${after.toLowerCase()}`).replaceAll('_', ' ');

/** Keep server validation details visible without exposing submitted financial values. */
export function confirmationErrorMessage(error: unknown, handoff: ReviewHandoff): string {
  const message = requestFailureMessage(error);
  if (!(error instanceof ExpenseApiError) || !error.details.length) return message;
  const included = handoff.rows.filter(row => row.inclusion === 'included');
  const details = error.details.flatMap(detail => {
    if (!detail || typeof detail !== 'object') return [];
    const { field, code, message: reason } = detail as Record<string, unknown>;
    if (typeof field !== 'string' || typeof code !== 'string') return [];
    const parts = field.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (parts[0] === 'expenses' && /^\d+$/u.test(parts[1] ?? '')) {
      const row = included[Number(parts[1])];
      const index = handoff.original.rows.findIndex(source => source.sourceRowId === row?.sourceRowId);
      parts.splice(0, 2, index >= 0 ? `Row ${index + 1}` : `Expense ${Number(parts[1]) + 1}`);
    }
    const label = parts.map(part => words(part === 'expenseDate' ? 'date' : part === 'categoryId' ? 'category' : part)).join(' · ') || 'Import';
    return [`${label}: ${typeof reason === 'string' && reason.trim() ? reason : words(code)}.`];
  });
  return details.length ? `${message}\n${[...new Set(details)].join('\n')}\nGo back to review to correct the listed fields. Statement evidence fields come from the PDF and cannot be edited in review.` : message;
}
