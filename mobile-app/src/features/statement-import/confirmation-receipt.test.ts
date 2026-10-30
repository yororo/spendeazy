import assert from 'node:assert/strict';
import test from 'node:test';
import { createReceiptOwner, parseReceipt, type ReceiptStorage } from './confirmation-receipt.ts';
import { createSession } from '../../application/session.ts';

const receipt = { userId: 'clerk-fictional', spaceId: '7', operationId: '11111111-1111-4111-8111-111111111111' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function storage(initial: string | null = null) {
  let value = initial;
  const adapter: ReceiptStorage = { getItemAsync: async () => value, setItemAsync: async (_, json) => { value = json; }, deleteItemAsync: async () => { value = null; } };
  return { adapter, value: () => value };
}

test('receipt parsing is exact and persisted content contains only owner, Space and operation', async () => {
  for (const value of [{ ...receipt, rows: [] }, { ...receipt, spaceId: '0' }, { ...receipt, operationId: 'bad' }, [], null]) assert.throws(() => parseReceipt(JSON.stringify(value)));
  const s = storage(); const owner = createReceiptOwner(s.adapter);
  await owner.hydrate(receipt.userId); await owner.write(receipt);
  assert.deepEqual(JSON.parse(s.value()!), receipt);
  await assert.rejects(owner.write({ ...receipt, operationId: '22222222-2222-4222-8222-222222222222' }));
});

test('sign-out during an in-flight write deletes after the late write and revokes the sender', async () => {
  const s = storage(); const entered = deferred(); const release = deferred();
  const set = s.adapter.setItemAsync;
  s.adapter.setItemAsync = async (...args) => { entered.resolve(); await release.promise; await set(...args); };
  const owner = createReceiptOwner(s.adapter); await owner.hydrate(receipt.userId);
  const session = createSession(() => {}, () => {}, owner); session.observeIdentity(receipt.userId);
  const writing = owner.write(receipt); await entered.promise;
  const rejected = assert.rejects(writing);
  const clearing = session.signOut();
  assert.equal(session.snapshot().ownerUserId, null); assert.equal(session.snapshot().cleanupPending, true);
  release.resolve(); await rejected; await clearing;
  assert.equal(s.value(), null); assert.equal(session.snapshot().cleanupPending, false);
});

test('stale hydration cannot restore prior identity after cleanup; failed delete gates restoration until retry', async () => {
  const s = storage(JSON.stringify(receipt)); const entered = deferred(); const release = deferred();
  s.adapter.getItemAsync = async () => { entered.resolve(); await release.promise; return JSON.stringify(receipt); };
  const owner = createReceiptOwner(s.adapter);
  const reading = owner.hydrate(receipt.userId); await entered.promise;
  const rejected = assert.rejects(reading); const clearing = owner.cleanup(); release.resolve(); await rejected; await clearing;
  assert.equal(s.value(), null);
  s.adapter.getItemAsync = async () => s.value();
  await owner.hydrate(receipt.userId); await owner.write(receipt);
  const remove = s.adapter.deleteItemAsync;
  s.adapter.deleteItemAsync = async () => { throw Error('device locked'); };
  await assert.rejects(owner.cleanup()); await assert.rejects(owner.hydrate('another-user')); await assert.rejects(owner.write(receipt));
  s.adapter.deleteItemAsync = remove; await owner.cleanup(); assert.equal(await owner.hydrate('another-user'), null);
});

test('read failure is not empty and acknowledgment cannot delete a later receipt', async () => {
  const s = storage(); const owner = createReceiptOwner(s.adapter);
  const get = s.adapter.getItemAsync; s.adapter.getItemAsync = async () => { throw Error('unavailable'); };
  await assert.rejects(owner.hydrate(receipt.userId)); await assert.rejects(owner.write(receipt));
  s.adapter.getItemAsync = get; await owner.hydrate(receipt.userId); await owner.write(receipt);
  await owner.clearMatching(receipt);
  const next = { ...receipt, operationId: '22222222-2222-4222-8222-222222222222' };
  await owner.write(next); await owner.clearMatching(receipt);
  assert.deepEqual(JSON.parse(s.value()!), next);
});

test('expiry retains receipt; accepted account deletion uses explicit cleanup without a mobile deletion UI', async () => {
  const s = storage(); const owner = createReceiptOwner(s.adapter); const session = createSession(() => {}, () => {}, owner);
  session.observeIdentity(receipt.userId); await owner.hydrate(receipt.userId); await owner.write(receipt);
  session.expire(session.capture()); assert.deepEqual(JSON.parse(s.value()!), receipt);
  await session.acceptedAccountDeletion(); assert.equal(s.value(), null); assert.equal(session.snapshot().ownerUserId, null);
});

test('an older successful cleanup cannot release a newer failed cleanup', async () => {
  const s = storage(JSON.stringify(receipt)); const entered = deferred(); const release = deferred(); let deletes = 0;
  s.adapter.deleteItemAsync = async () => { if (++deletes === 1) { entered.resolve(); await release.promise; } else throw Error('delete unavailable'); };
  const owner = createReceiptOwner(s.adapter); const session = createSession(() => {}, () => {}, owner);
  session.observeIdentity(receipt.userId);
  const first = session.signOut(); await entered.promise;
  const second = session.retryCleanup(); const rejected = assert.rejects(second);
  release.resolve(); await first; await rejected;
  assert.equal(session.snapshot().cleanupError, true);
  await assert.rejects(owner.hydrate('another-user')); await assert.rejects(owner.write(receipt));
});
