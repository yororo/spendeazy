import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearFinancialSelection,
  clearPrivateSession,
  holdPrivateSession,
  reconcilePrivateSession,
  type PrivateSession,
} from './private-session.ts';
import {
  applyAuthTransition,
  shouldAnnounceRecovery,
} from './session-transition.ts';

const held: PrivateSession = {
  ownerUserId: 'user_ada',
  draft: 'import-draft',
  financialSelection: 'category-9',
};

test('session expiry keeps private state for the same identity', () => {
  assert.deepEqual(holdPrivateSession(held), held);
});

test('the same identity recovers the held draft', () => {
  assert.deepEqual(reconcilePrivateSession(held, 'user_ada'), held);
});

test('a different identity does not inherit private state', () => {
  assert.deepEqual(reconcilePrivateSession(held, 'user_grace'), {
    ownerUserId: 'user_grace',
    draft: null,
    financialSelection: null,
  });
});

test('explicit sign-out removes private state', () => {
  assert.equal(clearPrivateSession(), null);
});

test('switching Spaces clears financial selections and keeps the draft owner', () => {
  assert.deepEqual(clearFinancialSelection(held), {
    ownerUserId: 'user_ada',
    draft: 'import-draft',
    financialSelection: null,
  });
});

test('session expiry asks for sign-in and keeps the held draft', () => {
  assert.deepEqual(
    applyAuthTransition({
      previousUserId: 'user_ada',
      nextUserId: null,
      explicitSignOut: false,
      held,
    }),
    { held, notice: 'expired' },
  );
});

test('explicit sign-out drops private state', () => {
  assert.deepEqual(
    applyAuthTransition({
      previousUserId: 'user_ada',
      nextUserId: null,
      explicitSignOut: true,
      held,
    }),
    { held: null, notice: null },
  );
});

test('announces recovery only when the same identity still has a draft', () => {
  const restored = reconcilePrivateSession(held, 'user_ada');
  assert.equal(shouldAnnounceRecovery('expired', held, restored), true);
  assert.equal(
    shouldAnnounceRecovery(
      'expired',
      held,
      reconcilePrivateSession(held, 'user_grace'),
    ),
    false,
  );
});
