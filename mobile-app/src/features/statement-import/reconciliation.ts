import type { ImportResult } from './import-model.ts';

/** Every equation uses original signed activity and controls, never eligible Expense totals. */
export function reconcile(differences: readonly (bigint | null)[], unresolved: boolean): ImportResult['reconciliation'] {
  const mismatch = differences.find(value => value !== null && value !== 0n);
  if (mismatch !== undefined) return { outcome: 'mismatch', differenceMinor: mismatch };
  if (unresolved || !differences.length || differences.some(value => value === null)) return { outcome: 'unavailable', differenceMinor: null };
  return { outcome: 'matched', differenceMinor: 0n };
}
