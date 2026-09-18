import {
  findProbableDuplicateGroups,
  MAX_COMMITTED_MATCHES_PER_GROUP,
} from './probable-duplicates';

describe('findProbableDuplicateGroups', () => {
  it('groups within-command and committed matches deterministically', () => {
    const groups = findProbableDuplicateGroups(
      [
        { transactionIndex: 2, fingerprint: 'fingerprint-b' },
        { transactionIndex: 0, fingerprint: 'fingerprint-a' },
        { transactionIndex: 1, fingerprint: 'fingerprint-a' },
        { transactionIndex: 3, fingerprint: 'fingerprint-b' },
        { transactionIndex: 4, fingerprint: 'fingerprint-c' },
      ],
      new Map([
        ['fingerprint-a', [{ id: '12' }, { id: '2' }]],
        ['fingerprint-b', [{ id: '20' }]],
        ['fingerprint-c', []],
      ]),
    );

    expect(groups).toEqual([
      {
        fingerprint: 'fingerprint-a',
        incomingTransactionIndexes: [0, 1],
        committedMatches: [{ id: '2' }, { id: '12' }],
      },
      {
        fingerprint: 'fingerprint-b',
        incomingTransactionIndexes: [2, 3],
        committedMatches: [{ id: '20' }],
      },
    ]);
  });

  it('caps committed matches for each group without capping incoming rows', () => {
    const committedMatches = Array.from(
      { length: MAX_COMMITTED_MATCHES_PER_GROUP + 1 },
      (_, index) => ({ id: String(index + 1) }),
    );

    const [group] = findProbableDuplicateGroups(
      [{ transactionIndex: 0, fingerprint: 'fingerprint-a' }],
      new Map([['fingerprint-a', committedMatches]]),
    );

    expect(group.committedMatches).toHaveLength(
      MAX_COMMITTED_MATCHES_PER_GROUP,
    );
    expect(group.committedMatches.at(-1)).toEqual({
      id: String(MAX_COMMITTED_MATCHES_PER_GROUP),
    });
  });

  it('ignores fingerprints with no repeated incoming or committed match', () => {
    expect(
      findProbableDuplicateGroups(
        [{ transactionIndex: 0, fingerprint: 'fingerprint-a' }],
        new Map(),
      ),
    ).toEqual([]);
  });
});
