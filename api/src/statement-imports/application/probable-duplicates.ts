export const MAX_COMMITTED_MATCHES_PER_GROUP = 100;

export interface FingerprintedTransaction {
  transactionIndex: number;
  fingerprint: string;
}

export interface CommittedDuplicateMatch {
  id: string;
}

export interface ProbableDuplicateGroup {
  fingerprint: string;
  incomingTransactionIndexes: number[];
  committedMatches: CommittedDuplicateMatch[];
}

export function findProbableDuplicateGroups(
  incomingTransactions: readonly FingerprintedTransaction[],
  committedMatchesByFingerprint: ReadonlyMap<
    string,
    readonly CommittedDuplicateMatch[]
  >,
): ProbableDuplicateGroup[] {
  const incomingByFingerprint = groupIncomingTransactions(incomingTransactions);

  return [...incomingByFingerprint.entries()]
    .filter(([fingerprint, transactionIndexes]) => {
      const committedMatches = committedMatchesByFingerprint.get(fingerprint);
      return (
        transactionIndexes.length > 1 || (committedMatches?.length ?? 0) > 0
      );
    })
    .map(([fingerprint, transactionIndexes]) => ({
      fingerprint,
      incomingTransactionIndexes: [...transactionIndexes].sort(
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

function groupIncomingTransactions(
  incomingTransactions: readonly FingerprintedTransaction[],
): Map<string, number[]> {
  const incomingByFingerprint = new Map<string, number[]>();

  for (const transaction of incomingTransactions) {
    const transactionIndexes = incomingByFingerprint.get(
      transaction.fingerprint,
    );
    if (transactionIndexes) {
      transactionIndexes.push(transaction.transactionIndex);
    } else {
      incomingByFingerprint.set(transaction.fingerprint, [
        transaction.transactionIndex,
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
    left.incomingTransactionIndexes[0] - right.incomingTransactionIndexes[0];
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
