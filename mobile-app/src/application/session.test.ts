import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from './session.ts';
import { interpretStatement } from '../features/statement-import/providers.ts';

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

test('application session owns review alongside manual work and prevents destination switching until discard', () => {
  const session = createSession(); session.observeIdentity('ada', 'first'); session.changeSpace('personal');
  const manual = { amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' };
  session.saveDraft(manual);
  const store = session.imports;
  const owner = { userId: 'ada', spaceId: 'personal' };
  const operation = { id: 'extract', owner, generation: session.capture().generation };
  const file = { name: 'fictional.pdf', sha256: 'fictional', byteCount: 100 };
  const original = interpretStatement({ draftId: 'draft', owner, file, pages: [{ pageIndex: 0, outcome: 'text', hasImages: false,
    text: 'GCash Transaction History\n2026-01-01 to 2026-01-15\nSTARTING BALANCE 2000.00\nENDING BALANCE 1000.00\nDate and Time Description Reference No. Debit Credit Balance\n2026-01-01 09:00 AM FICTIONAL PURCHASE 1001 1000.00 1000.00' }] });
  store.start('draft', operation);
  store.deliver(operation, { type: 'picked' }); store.deliver(operation, { type: 'prepared', file });
  store.deliver(operation, { type: 'workerReady' }); store.deliver(operation, { type: 'extracted' });
  store.deliver(operation, { type: 'interpreted', result: original }); store.initializeReview(store.captureReview()!);
  const review = store.snapshot();
  assert.equal(session.changeSpace('shared'), false);
  assert.equal(session.snapshot().draft, manual);
  session.expire(session.capture()); session.observeIdentity('ada', 'replacement');
  assert.equal(session.snapshot().announceRecovery, true);
  assert.equal(session.snapshot().draft, manual);
  const recovered = store.snapshot();
  assert.ok(review.phase === 'review' && recovered.phase === 'review');
  assert.equal(recovered.review, review.review);
  store.discard(); assert.equal(session.changeSpace('shared'), true);
  assert.equal(session.snapshot().draft?.description, 'Lunch');
  assert.equal(session.snapshot().draft?.categoryId, null);
});
