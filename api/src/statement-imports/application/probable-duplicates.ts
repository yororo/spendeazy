export const MAX_COMMITTED_MATCHES_PER_GROUP = 100;

export interface FingerprintedExpense {
  expenseIndex: number;
  fingerprint: string;
}

export interface CommittedDuplicateMatch {
  id: string;
}

export interface ProbableDuplicateGroup {
  fingerprint: string;
  incomingExpenseIndexes: number[];
  committedMatches: CommittedDuplicateMatch[];
}

export function findProbableDuplicateGroups(
  incomingExpenses: readonly FingerprintedExpense[],
  committedMatchesByFingerprint: ReadonlyMap<
    string,
    readonly CommittedDuplicateMatch[]
  >,
): ProbableDuplicateGroup[] {
  const incomingByFingerprint = groupIncomingExpenses(incomingExpenses);

  return [...incomingByFingerprint.entries()]
    .filter(([fingerprint, expenseIndexes]) => {
      const committedMatches = committedMatchesByFingerprint.get(fingerprint);
      return (
        expenseIndexes.length > 1 || (committedMatches?.length ?? 0) > 0
      );
    })
    .map(([fingerprint, expenseIndexes]) => ({
      fingerprint,
      incomingExpenseIndexes: [...expenseIndexes].sort(
        (left, right) => left - right,
      ),
      committedMatches: [
        ...(committedMatchesByFingerprint.get(fingerprint) ?? []),
      ]
        .sort((left, right) => compareIdentifiers(left.id, right.id))
        .slice(0, MAX_COMMITTED_MATCHES_PER_GROUP),
    }))
    .sort(compareGroups);
}

function groupIncomingExpenses(
  incomingExpenses: readonly FingerprintedExpense[],
): Map<string, number[]> {
  const incomingByFingerprint = new Map<string, number[]>();

  for (const expense of incomingExpenses) {
    const expenseIndexes = incomingByFingerprint.get(
      expense.fingerprint,
    );
    if (expenseIndexes) {
      expenseIndexes.push(expense.expenseIndex);
    } else {
      incomingByFingerprint.set(expense.fingerprint, [
        expense.expenseIndex,
      ]);
    }
  }

  return incomingByFingerprint;
}

function compareGroups(
  left: ProbableDuplicateGroup,
  right: ProbableDuplicateGroup,
): number {
  const firstIndexDifference =
    left.incomingExpenseIndexes[0] - right.incomingExpenseIndexes[0];
  return (
    firstIndexDifference || left.fingerprint.localeCompare(right.fingerprint)
  );
}

function compareIdentifiers(left: string, right: string): number {
  try {
    const difference = BigInt(left) - BigInt(right);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}
