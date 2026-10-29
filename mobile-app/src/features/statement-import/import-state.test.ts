import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../../application/session.ts';
import type { ImportResult } from './import-model.ts';
import type { ImportOperation, ImportOutcome } from './import-state.ts';

function setup() {
  const session = createSession();
  session.observeIdentity('ada', 'first');
  session.changeSpace('personal');
  const operation = (id: string): ImportOperation => ({
    id, generation: session.capture().generation, owner: { userId: 'ada', spaceId: 'personal' },
  });
  return { session, store: session.imports, operation };
}
const file = { name: 'fictional.pdf', byteCount: 123, sha256: 'a'.repeat(64) };
function result(): ImportResult {
  return {
    draftId: 'draft', owner: { userId: 'ada', spaceId: 'personal' }, file,
    account: { provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' },
    dates: { statementDate: null, historyPeriod: { from: '2026-01-01', to: '2026-01-31' } },
    controls: [], rows: [{
      sourceRowId: '0:0', pageIndex: 0, sourceOrder: 0, description: 'Fictional purchase',
      originalDate: '2026-01-02', date: '2026-01-02', reference: null, originalAmount: '1000.00',
      signedActivityMinor: 100000n, evidence: [{ kind: 'debit-credit-column', value: 'debit' }],
      classification: { eligible: true, kind: 'purchase', expenseMinor: 100000n },
    }],
    pages: [{ pageIndex: 0, outcome: 'text', hasImages: false }],
    completeness: { assessment: 'uncertain', failedPageIndices: [], unreadablePageIndices: [] },
    recognitionEvidence: [{ kind: 'provider', value: 'GCash' }],
    reconciliation: { outcome: 'unavailable', differenceMinor: null }, warnings: [],
  };
}
function extract(store: ReturnType<typeof setup>['store'], op: ImportOperation) {
  store.deliver(op, { type: 'picked' });
  store.deliver(op, { type: 'prepared', file });
  store.deliver(op, { type: 'workerReady' });
}

test('all async outcomes and cancellation from a replaced operation are ignored', () => {
  const { store, operation } = setup();
  const first = operation('first');
  store.start('draft', first);
  let cleared = 0;
  store.onInvalidate(first, () => { assert.equal(store.snapshot().phase, 'idle'); cleared++; });
  store.cancel(first);
  const next = operation('next');
  assert.equal(store.start('replacement', next), true);
  const before = store.snapshot();
  const outcomes: ImportOutcome[] = [
    { type: 'picked' }, { type: 'prepared', file }, { type: 'workerReady' },
    { type: 'progress', completedPages: 1, totalPages: 2 }, { type: 'passwordRequired', reason: 'required' },
    { type: 'passwordSubmitted' }, { type: 'extracted' }, { type: 'interpreted', result: result() },
    { type: 'failed', error: 'picker-failed' }, { type: 'failed', error: 'prepare-failed' },
  ];
  for (const outcome of outcomes) store.deliver(first, outcome);
  store.cancel(first);
  store.deliver({ ...next, owner: { userId: 'bea', spaceId: 'personal' } }, { type: 'picked' });
  store.deliver({ ...next, owner: { userId: 'ada', spaceId: 'shared' } }, { type: 'picked' });
  assert.equal(store.snapshot(), before);
  assert.equal(cleared, 1);
});

test('worker readiness waits for preparation; password/progress and result ownership obey phases', () => {
  const { store, operation } = setup();
  const op = operation('first');
  store.start('draft', op);
  store.deliver(op, { type: 'workerReady' });
  assert.equal(store.snapshot().phase, 'picking');
  extract(store, op);
  store.deliver(op, { type: 'passwordRequired', reason: 'required' });
  store.deliver(op, { type: 'passwordSubmitted' });
  store.deliver(op, { type: 'passwordRequired', reason: 'incorrect' });
  assert.equal(store.snapshot().phase, 'password-required');
  store.deliver(op, { type: 'passwordSubmitted' });
  store.deliver(op, { type: 'progress', completedPages: 1, totalPages: 2 });
  const progress = store.snapshot();
  store.deliver(op, { type: 'progress', completedPages: -1, totalPages: 2 });
  assert.equal(store.snapshot(), progress);
  store.deliver(op, { type: 'extracted' });
  store.deliver(op, { type: 'interpreted', result: { ...result(), owner: { userId: 'ada', spaceId: 'shared' } } });
  store.deliver(op, { type: 'interpreted', result: { ...result(), draftId: 'wrong' } });
  store.deliver(op, { type: 'interpreted', result: { ...result(), rows: [] } });
  assert.equal(store.snapshot().phase, 'interpreting');
  let cleared = false;
  store.onInvalidate(op, () => { cleared = true; });
  store.deliver(op, { type: 'interpreted', result: result() });
  assert.equal(store.snapshot().phase, 'ready');
  assert.equal(cleared, true);
  store.deliver(op, { type: 'failed', error: 'unreadable' });
  assert.equal(store.snapshot().phase, 'ready');
});

test('expiry clears adapter references; same identity needs reselection for interrupted work', () => {
  const { session, store, operation } = setup();
  const old = operation('first');
  store.start('draft', old);
  extract(store, old);
  let cleared = 0;
  store.onInvalidate(old, () => { assert.equal(store.snapshot().phase, 'suspended'); cleared++; });
  session.expire(session.capture());
  store.deliver(old, { type: 'extracted' });
  assert.equal(store.snapshot().phase, 'suspended');
  session.observeIdentity(null);
  session.observeIdentity('ada', 'replacement');
  assert.deepEqual(store.snapshot(), { phase: 'suspended', draftId: 'draft', owner: old.owner, reason: 'reselection-required', result: null });
  assert.equal(session.snapshot().announceRecovery, true);
  assert.equal(store.start('draft', old), false);
  assert.equal(store.start('draft', operation('new')), true);
  assert.equal(cleared, 1);
});

test('completed evidence survives same User recovery and archive, while archives block new work', () => {
  const { session, store, operation } = setup();
  const op = operation('first');
  store.start('draft', op); extract(store, op);
  store.deliver(op, { type: 'extracted' });
  const evidence = result();
  store.deliver(op, { type: 'interpreted', result: evidence });
  session.expire(session.capture());
  session.observeIdentity('ada', 'replacement');
  const ready = store.snapshot();
  assert.equal(ready.phase === 'ready' && ready.result, evidence);
  session.changeSpace('personal', false);
  assert.equal(store.snapshot(), ready);
  store.discard();
  assert.equal(store.start('new', operation('new')), false);
});

test('archive during extraction clears references and fences delivery after access returns', () => {
  const { session, store, operation } = setup();
  const old = operation('first');
  store.start('draft', old); extract(store, old);
  let cleared = 0;
  store.onInvalidate(old, () => { cleared++; });
  session.changeSpace('personal', false);
  store.deliver(old, { type: 'extracted' });
  assert.equal(store.snapshot().phase, 'suspended');
  session.changeSpace('personal', true);
  store.deliver(old, { type: 'failed', error: 'unreadable' });
  assert.equal(store.snapshot().phase, 'suspended');
  assert.equal(cleared, 1);
});

for (const transition of ['sign-out', 'different-identity'] as const) {
  test(`${transition} clears import state and prevents cross-identity delivery`, () => {
    const { session, store, operation } = setup();
    const old = operation('first');
    store.start('draft', old);
    let cleared = false;
    store.onInvalidate(old, () => { cleared = true; });
    if (transition === 'sign-out') session.signOut();
    else session.observeIdentity('bea', 'second');
    store.deliver(old, { type: 'failed', error: 'prepare-failed' });
    assert.deepEqual(store.snapshot(), { phase: 'idle' });
    assert.equal(cleared, true);
  });
}

test('replacement credentials invalidate active extraction even without an explicit expiry event', () => {
  const { session, store, operation } = setup();
  const old = operation('first'); store.start('draft', old);
  session.observeIdentity('ada', 'replacement');
  store.deliver(old, { type: 'picked' });
  assert.equal(store.snapshot().phase, 'suspended');
});
