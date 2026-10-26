import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../session.ts';
import { createSpacesWorkflow } from './workflow.ts';
import type { AccessibleSpace } from './active-space.ts';

const personal: AccessibleSpace = { id: '1', kind: 'personal', status: 'active', accessLevel: 'write', members: [{ id: '1', name: 'Ada' }] };
const shared: AccessibleSpace = { ...personal, id: '2', kind: 'shared' };

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
