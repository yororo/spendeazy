import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from './session.ts';

test('expiry retains work for the same identity and rejects old requests after recovery', () => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  session.saveDraft({ amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' });
  const request = session.capture();
  assert.equal(session.expire(request), true);
  assert.equal(session.expire(request), false);
  assert.equal(session.snapshot().notice, 'expired');
  session.observeIdentity(null);
  session.observeIdentity('ada');
  assert.equal(session.snapshot().draft?.description, 'Lunch');
  assert.equal(session.isCurrent(request), false);
});

test('expired sessions cannot start another request, and obsolete failures cannot expire a new identity', () => {
  const session = createSession();
  session.observeIdentity('ada');
  const old = session.capture();
  session.expire(old);
  assert.equal(session.isCurrent(session.capture()), false);
  session.observeIdentity('grace');
  assert.equal(session.expire(old), false);
  assert.equal(session.snapshot().notice, null);
});

test('explicit sign-out immediately clears work and selections; another identity inherits nothing', () => {
  let selection = 'food';
  const session = createSession(() => { selection = ''; });
  session.observeIdentity('ada');
  session.changeSpace('personal');
  session.saveDraft({ amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' });
  selection = 'food';
  session.signOut();
  assert.equal(session.snapshot().draft, null);
  assert.equal(session.snapshot().spaceId, null);
  assert.equal(selection, '');
  session.observeIdentity('grace');
  assert.equal(session.snapshot().draft, null);
});

test('a Space change preserves entered values, clears the Category and selections, and rejects old outcomes', () => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  session.saveDraft({ amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' });
  const old = session.capture();
  session.changeSpace('shared');
  assert.equal(session.snapshot().draft?.description, 'Lunch');
  assert.equal(session.snapshot().draft?.categoryId, null);
  assert.equal(session.expire(old), false);
  session.observeIdentity(null);
  session.observeIdentity('grace');
  assert.equal(session.snapshot().draft, null);
});

test('a replacement Clerk session for the same identity recovers work and invalidates old credentials', () => {
  const session = createSession();
  session.observeIdentity('ada', 'first');
  session.saveDraft({ amount: '12', description: 'Lunch', categoryId: null, expenseDate: '2026-10-24' });
  const old = session.capture();
  session.expire(old);
  session.observeIdentity('ada', 'replacement');
  assert.equal(session.snapshot().notice, null);
  assert.equal(session.snapshot().announceRecovery, true);
  assert.equal(session.snapshot().draft?.description, 'Lunch');
  assert.equal(session.expire(old), false);
});
