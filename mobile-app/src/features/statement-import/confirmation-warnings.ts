import type { ImportAdvisoryWarning } from './confirmation-contract.ts';

/** Group presentation only; confirmation must acknowledge the original warning IDs. */
export function confirmationWarnings(warnings: readonly ImportAdvisoryWarning[]) {
  const groups = new Map<string, { id: string; type: ImportAdvisoryWarning['type']; message: string; sourceRowIds: string[] }>();
  for (const warning of warnings) {
    const key = warning.type === 'reconciliation' ? `${warning.type}:${warning.message}` : warning.type;
    const group = groups.get(key) ?? { id: key, type: warning.type, message: warning.message, sourceRowIds: [] };
    group.sourceRowIds = [...new Set([...group.sourceRowIds, ...warning.sourceRowIds])];
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const count = group.sourceRowIds.length;
    if (group.type === 'exact_file') return { ...group, message: 'This file was previously imported into this Space.' };
    if (group.type === 'probable_duplicate') return {
      ...group,
      message: count
        ? `${count} ${count === 1 ? 'Transaction may match' : 'Transactions may match'} an imported Expense or another reviewed Transaction.`
        : 'Reviewed Transactions may match imported Expenses or other reviewed Transactions.',
    };
    return { ...group, message: `${group.message}${count ? ` (${count} ${count === 1 ? 'row' : 'rows'})` : ''}` };
  });
}
