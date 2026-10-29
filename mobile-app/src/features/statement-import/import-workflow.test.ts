import assert from 'node:assert/strict';
import test from 'node:test';
import { createImportWorkflow } from './import-workflow.ts';
import { createImportStore } from './import-store.ts';
import { createFileOwnership, isPickerCopy } from './file-ownership.ts';
import { decodeEngineMessage } from './extraction-bridge.ts';

const owner = { userId: 'u', spaceId: 's' };
const operation = { id: 'one', generation: 1, owner };
const file = { name: 'fictional.pdf', byteCount: 10, sha256: 'fictional' };
function setup() {
  let writable = true;
  const calls: string[] = [];
  const store = createImportStore(() => ({ userId: 'u', ownerUserId: 'u', spaceId: 's', authenticated: true, writable, generation: 1 }));
  const deps = { store, sweep() { calls.push('sweep'); }, track(uri: string) { calls.push(`track:${uri}`); }, release(uri: string) { calls.push(`release:${uri}`); },
    pick: async () => ({ canceled: false, assets: [{ uri: 'cache/picker/copy.pdf', name: 'fictional.pdf' }] }),
    prepare: async () => ({ identity: file, base64: 'transient' }) };
  return { store, deps, calls, archive() { writable = false; store.synchronize(); } };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
test('startup cleanup precedes picker; bytes transfer once and readiness belongs to this operation', async () => {
  const { deps, store, calls } = setup(); const flow = createImportWorkflow(deps);
  await flow.select('draft', operation); assert.equal(store.snapshot().phase, 'idle');
  await flow.recover(); await flow.select('draft', operation);
  assert.equal(calls[0], 'sweep');
  flow.receive({ type: 'ready', id: 'stale' }); assert.equal(store.snapshot().phase, 'preparing');
  flow.receive({ type: 'ready', id: operation.id }); assert.equal(store.snapshot().phase, 'extracting');
  assert.equal(flow.consumeBytes(operation.id), 'transient'); assert.equal(flow.consumeBytes(operation.id), null);
  flow.cancel(); assert.equal(store.snapshot().phase, 'idle'); assert.equal(flow.snapshot().request, null);
  await turn();
  await flow.select('draft2', { ...operation, id: 'two' });
  assert.equal(flow.snapshot().request?.id, 'two');
  flow.receive({ type: 'error', id: 'one', code: 'unreadable' }); assert.equal(store.snapshot().phase, 'preparing');
});
test('late picker outcome after cancellation is journaled and deleted without preparing', async () => {
  const { deps, calls, store } = setup();
  let finish!: (result: Awaited<ReturnType<typeof deps.pick>>) => void;
  deps.pick = () => new Promise(resolve => { finish = resolve; });
  deps.prepare = async () => { assert.fail('late outcome must not prepare'); };
  const flow = createImportWorkflow(deps); await flow.recover();
  const pending = flow.select('draft', operation); flow.cancel();
  finish({ canceled: false, assets: [{ uri: 'cache/picker/late.pdf', name: 'fictional.pdf' }] });
  await pending; await turn();
  assert.ok(calls.includes('track:cache/picker/late.pdf')); assert.ok(calls.includes('release:cache/picker/late.pdf'));
  assert.equal(store.snapshot().phase, 'idle'); assert.equal(flow.snapshot().request, null);
});
test('password retries and archive invalidation clear transient extraction state', async () => {
  const { deps, store, archive } = setup(); const flow = createImportWorkflow(deps); await flow.recover();
  await flow.select('draft', operation); flow.receive({ type: 'ready', id: 'one' });
  flow.receive({ type: 'password', id: 'one', incorrect: false }); assert.equal(store.snapshot().phase, 'password-required');
  flow.passwordSent('one'); flow.receive({ type: 'password', id: 'one', incorrect: true });
  assert.equal(store.snapshot().phase, 'password-required');
  archive(); assert.equal(store.snapshot().phase, 'suspended'); assert.equal(flow.snapshot().request, null);
});
test('cleanup failure blocks selection until explicit retry succeeds', async () => {
  const { deps, store } = setup(); let fail = true;
  deps.sweep = () => { if (fail) throw new Error('private native error'); };
  const flow = createImportWorkflow(deps); await flow.recover();
  assert.equal(flow.snapshot().cleanup, 'failed'); await flow.select('draft', operation); assert.equal(store.snapshot().phase, 'idle');
  fail = false; await flow.recover(); await flow.select('draft', operation); assert.equal(store.snapshot().phase, 'preparing');
});
test('owned-only journal rejects originals, traversal and sibling directories; failed deletion remains journaled', () => {
  const root = 'file:///cache/DocumentPicker';
  for (const uri of ['file:///documents/original.pdf', `${root}/../original.pdf`, `${root}/%2e%2e`, `${root}Other/copy.pdf`, `${root}/a/b.pdf`]) assert.equal(isPickerCopy(uri, root), false);
  let journal: string[] = []; let fail = true; const deleted: string[] = [];
  const files = createFileOwnership({ pickerDirectory: root, readJournal: () => journal, writeJournal: value => { journal = value; },
    remove: uri => { if (fail) throw new Error('failed'); deleted.push(uri); }, sweepOwned() { deleted.push('owned-only'); } });
  files.track(`${root}/copy.pdf`); assert.throws(() => files.sweep()); assert.equal(journal.length, 1);
  fail = false; files.sweep(); assert.deepEqual(journal, []); assert.deepEqual(deleted, [`${root}/copy.pdf`, 'owned-only']);
  assert.throws(() => files.track('file:///documents/original.pdf'));
});
test('bridge rejects malformed, wrong-operation, unsafe page and progress messages', () => {
  for (const value of ['not-json', '{}', '{"id":"other","type":"ready"}', '{"id":"one","type":"progress","completedPages":2,"totalPages":1}',
    '{"id":"one","type":"result","pages":[{"pageIndex":4,"outcome":"text","text":"fictional","hasImages":false}]}']) assert.equal(decodeEngineMessage(value, 'one'), null);
  assert.deepEqual(decodeEngineMessage('{"id":"one","type":"password","incorrect":true}', 'one'), { id: 'one', type: 'password', incorrect: true });
});

test('successful extraction releases adapter resources before review, and a new route workflow retains review', async () => {
  const { deps, store, calls } = setup();
  const flow = createImportWorkflow(deps); await flow.recover(); await flow.select('draft', operation);
  flow.receive({ type: 'ready', id: 'one' });
  const pages = [{ pageIndex: 0, outcome: 'text' as const, hasImages: false,
    text: 'GCash Transaction History\n2026-01-01 to 2026-01-15\nSTARTING BALANCE 2000.00\nENDING BALANCE 1000.00\nDate and Time Description Reference No. Debit Credit Balance\n2026-01-01 09:00 AM FICTIONAL PURCHASE 1001 1000.00 1000.00' }];
  flow.receive({ type: 'result', id: 'one', pages });
  assert.equal(store.snapshot().phase, 'ready');
  assert.equal(flow.snapshot().request, null); assert.equal(pages.length, 0);
  assert.ok(calls.includes('release:cache/picker/copy.pdf'));
  const scope = store.captureReview()!; store.initializeReview(scope);
  const review = store.snapshot();
  const remount = createImportWorkflow(deps); await remount.recover();
  assert.equal(store.snapshot(), review);
  await remount.select('replacement', { ...operation, id: 'two' });
  assert.equal(store.snapshot(), review);
  remount.discard(); assert.equal(store.snapshot().phase, 'idle');
});
