import {
  findProbableDuplicateGroups,
  MAX_COMMITTED_MATCHES_PER_GROUP,
} from './probable-duplicates';

describe('findProbableDuplicateGroups', () => {
  it('groups incoming Expenses and committed matches deterministically', () => {
    const groups = findProbableDuplicateGroups(
      [
        { expenseIndex: 2, fingerprint: 'fingerprint-b' },
        { expenseIndex: 0, fingerprint: 'fingerprint-a' },
        { expenseIndex: 1, fingerprint: 'fingerprint-a' },
        { expenseIndex: 3, fingerprint: 'fingerprint-b' },
        { expenseIndex: 4, fingerprint: 'fingerprint-c' },
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
        incomingExpenseIndexes: [0, 1],
        committedMatches: [{ id: '2' }, { id: '12' }],
      },
      {
        fingerprint: 'fingerprint-b',
        incomingExpenseIndexes: [2, 3],
        committedMatches: [{ id: '20' }],
      },
    ]);
  });

  it('caps committed matches and ignores singleton fingerprints', () => {
    const committedMatches = Array.from(
      { length: MAX_COMMITTED_MATCHES_PER_GROUP + 1 },
      (_, index) => ({ id: String(index + 1) }),
    );
    const [group] = findProbableDuplicateGroups(
      [{ expenseIndex: 0, fingerprint: 'fingerprint-a' }],
      new Map([['fingerprint-a', committedMatches]]),
    );
    expect(group.committedMatches).toHaveLength(
      MAX_COMMITTED_MATCHES_PER_GROUP,
    );
    expect(
      findProbableDuplicateGroups(
        [{ expenseIndex: 0, fingerprint: 'single' }],
        new Map(),
      ),
    ).toEqual([]);
  });
});
