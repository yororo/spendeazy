import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../session.ts';
import { createSpacesWorkflow } from './workflow.ts';
import type { AccessibleSpace } from './active-space.ts';
import { createReceiptOwner } from '../../features/statement-import/confirmation-receipt.ts';

const personal: AccessibleSpace = { id: '1', kind: 'personal', status: 'active', accessLevel: 'write', members: [{ id: '1', name: 'Ada' }] };
const shared: AccessibleSpace = { ...personal, id: '2', kind: 'shared' };

test('receipt hydration precedes provisioning and suppresses Personal fallback for archived or inaccessible original Space', async () => {
  for (const available of [true, false]) {
    let read = false;
    const owner = createReceiptOwner({
      getItemAsync: async () => { read = true; return JSON.stringify({ userId: 'ada', spaceId: shared.id, operationId: '11111111-1111-4111-8111-111111111111' }); },
      setItemAsync: async () => { throw Error('restart must not write'); }, deleteItemAsync: async () => {},
    });
    const session = createSession(() => {}, () => {}, owner); session.observeIdentity('ada');
    const archived = { ...shared, status: 'archived' as const, accessLevel: 'read' as const };
    const workflow = createSpacesWorkflow(session, {
      provision: async () => { assert.equal(read, true); }, list: async () => available ? [personal, archived] : [personal],
      read: async () => personal.id, write: async () => true,
    });
    await workflow.load();
    assert.equal(workflow.snapshot().active?.id ?? null, available ? shared.id : null);
    assert.equal(session.snapshot().spaceWritable, false); assert.equal(session.confirmation.receipt()?.spaceId, shared.id);
    await workflow.select(personal.id); assert.notEqual(session.snapshot().spaceId, personal.id);
    workflow.discardUnsavedWork(); assert.equal(session.confirmation.hasReceipt(), true);
  }
});

test('failed receipt reads block startup rather than selecting Personal', async () => {
  let reads = 0;
  const owner = createReceiptOwner({ getItemAsync: async () => { if (++reads === 1) throw Error('device locked'); return null; }, setItemAsync: async () => {}, deleteItemAsync: async () => {} });
  const session = createSession(() => {}, () => {}, owner); session.observeIdentity('ada');
  let lists = 0;
  const workflow = createSpacesWorkflow(session, { provision: async () => {}, list: async () => { lists++; return [personal]; }, read: async () => null, write: async () => true });
  await workflow.load(); assert.equal(lists, 0); assert.notEqual(workflow.snapshot().error, null); assert.equal(session.snapshot().spaceId, null);
  await workflow.load(); assert.equal(workflow.snapshot().active?.id, personal.id);
});

test('Spaces rejects a load when identity changes during device memory lookup', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let finish!: (id: string | null) => void;
  const memory = new Promise<string | null>((resolve) => { finish = resolve; });
  const spaces = createSpacesWorkflow(session, {
    provision: async () => {},
    list: async () => [personal], read: async () => memory, write: async () => true,
  });
  const result = spaces.load();
  await new Promise((resolve) => setImmediate(resolve));
  session.observeIdentity('grace');
  finish('1'); await result;
  assert.equal(spaces.snapshot().active, null);
  assert.equal(session.snapshot().spaceId, null);
});

test('Spaces selects only accessible Spaces and preserves the latest choice during refresh', async () => {
  const session = createSession(); session.observeIdentity('ada');
  const spaces = createSpacesWorkflow(session, { provision: async () => {}, list: async () => [personal, shared], read: async () => '1', write: async () => true });
  await spaces.load();
  await spaces.select('2');
  await spaces.load();
  assert.equal(spaces.snapshot().active?.id, '2');
  await spaces.select('unavailable');
  assert.equal(session.snapshot().spaceId, '2');
  session.signOut();
  assert.deepEqual(spaces.snapshot().spaces, []);
});

test('Spaces controller discards the unsaved Expense only for its current session', async () => {
  const session = createSession(); session.observeIdentity('ada');
  session.saveDraft({ amount: '12.00', description: 'Market', categoryId: '3', expenseDate: '2026-10-26' });
  const spaces = createSpacesWorkflow(session, {
    provision: async () => {}, list: async () => [personal],
    read: async () => null, write: async () => true,
  });
  await spaces.load();
  assert.notEqual(session.snapshot().draft, null);
  spaces.discardUnsavedExpense();
  assert.equal(session.snapshot().draft, null);

  session.saveDraft({ amount: '', description: '', categoryId: null, expenseDate: '2026-10-26' });
  session.observeIdentity('grace');
  spaces.discardUnsavedExpense();
  assert.equal(session.snapshot().draft, null);
});

test('Spaces retries failed provisioning before reading private data and reuses success on refresh', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let attempts = 0;
  let lists = 0;
  const spaces = createSpacesWorkflow(session, {
    provision: async () => { if (++attempts === 1) throw new Error('Profile temporarily unavailable'); },
    list: async () => { lists++; return [personal]; },
    read: async () => null, write: async () => true,
  });
  await spaces.load();
  assert.notEqual(spaces.snapshot().error, null);
  assert.equal(lists, 0);
  await spaces.load();
  assert.equal(spaces.snapshot().error, null);
  assert.equal(spaces.snapshot().active?.id, personal.id);
  await spaces.load();
  assert.equal(attempts, 2);
  assert.equal(lists, 2);
});

test('overlapping refreshes share provisioning and only the latest load reads Spaces', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let finish!: () => void;
  const provisioning = new Promise<void>(resolve => { finish = resolve; });
  let provisions = 0;
  let lists = 0;
  const spaces = createSpacesWorkflow(session, {
    provision: () => { provisions++; return provisioning; },
    list: async () => { lists++; return [personal]; },
    read: async () => null, write: async () => true,
  });
  const first = spaces.load();
  const second = spaces.load();
  assert.equal(lists, 0);
  finish();
  await Promise.all([first, second]);
  assert.equal(provisions, 1);
  assert.equal(lists, 1);
  assert.equal(spaces.snapshot().active?.id, personal.id);
});

test('identity changes during provisioning prevent the old workflow from reading private data', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let finish!: () => void;
  const provisioning = new Promise<void>(resolve => { finish = resolve; });
  let lists = 0;
  const spaces = createSpacesWorkflow(session, {
    provision: () => provisioning,
    list: async () => { lists++; return [personal]; },
    read: async () => null, write: async () => true,
  });
  const pending = spaces.load();
  session.observeIdentity('grace');
  finish();
  await pending;
  assert.equal(lists, 0);
  assert.equal(spaces.snapshot().active, null);
  assert.equal(session.snapshot().spaceId, null);
});

test('import work blocks Space switches until explicit discard without changing manual remapping', async () => {
  const session = createSession(); session.observeIdentity('ada');
  const spaces = createSpacesWorkflow(session, {
    provision: async () => {}, list: async () => [personal, shared],
    read: async () => null, write: async () => true,
  });
  await spaces.load();
  session.saveDraft({ amount: '12.00', description: 'Market', categoryId: '3', expenseDate: '2026-10-26' });
  const op = { id: 'operation', generation: session.capture().generation, owner: { userId: 'ada', spaceId: personal.id } };
  session.imports.start('draft', op);
  const before = session.imports.snapshot();
  await spaces.select(shared.id);
  assert.equal(session.snapshot().spaceId, personal.id);
  assert.equal(spaces.snapshot().active?.id, personal.id);
  assert.equal(session.imports.snapshot(), before); // Keep editing requires no mutation.
  assert.equal(session.snapshot().draft?.categoryId, '3');
  spaces.discardUnsavedWork();
  await spaces.select(shared.id);
  assert.equal(session.imports.hasWork(), false);
  assert.equal(session.snapshot().draft, null);
  assert.equal(session.snapshot().spaceId, shared.id);

  session.saveDraft({ amount: '12.00', description: 'Market', categoryId: '3', expenseDate: '2026-10-26' });
  await spaces.select(personal.id);
  assert.equal(session.snapshot().draft?.description, 'Market');
  assert.equal(session.snapshot().draft?.categoryId, null);
});

test('Space refresh applies archive access to imports without redirecting work', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let available = [personal, shared];
  const spaces = createSpacesWorkflow(session, {
    provision: async () => {}, list: async () => available,
    read: async () => shared.id, write: async () => true,
  });
  await spaces.load();
  const operation = { id: 'operation', generation: session.capture().generation, owner: { userId: 'ada', spaceId: shared.id } };
  session.imports.start('draft', operation);
  available = [personal, { ...shared, status: 'archived', accessLevel: 'read' }];
  await spaces.load();
  assert.equal(spaces.snapshot().active?.status, 'archived');
  assert.equal(session.imports.snapshot().phase, 'suspended');
  assert.equal(session.snapshot().spaceWritable, false);
  assert.equal(session.imports.start('new', operation), false);

  available = [personal];
  await spaces.load();
  assert.equal(spaces.snapshot().active, null);
  assert.equal(session.snapshot().spaceId, shared.id);
  assert.equal(session.imports.snapshot().phase, 'suspended');
});
