import { shouldRemoveIdentityMembership } from './typeorm-space-lifecycle-store';

describe('identity deletion membership retention', () => {
  it('removes Personal membership but keeps Shared membership as history', () => {
    expect(shouldRemoveIdentityMembership({ kind: 'personal' })).toBe(true);
    expect(shouldRemoveIdentityMembership({ kind: 'shared' })).toBe(false);
  });
});
