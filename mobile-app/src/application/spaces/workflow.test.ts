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
  const spaces = createSpacesWorkflow(session, { list: async () => [personal, shared], read: async () => '1', write: async () => true });
  await spaces.load();
  await spaces.select('2');
  await spaces.load();
  assert.equal(spaces.snapshot().active?.id, '2');
  await spaces.select('unavailable');
  assert.equal(session.snapshot().spaceId, '2');
  session.signOut();
  assert.deepEqual(spaces.snapshot().spaces, []);
});
