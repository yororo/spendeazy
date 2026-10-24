import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from './session.ts';
import { createSessionResource } from './session-resource.ts';
import { ExpenseApiError } from '../api/request-failure.ts';

test('resource retries and refresh replaces an obsolete pagination completion', async () => {
  const session = createSession(); session.observeIdentity('ada');
  const resource = createSessionResource<string[]>(session);
  await resource.load(async () => { throw new Error('offline'); });
  assert.ok(resource.snapshot().error);
  await resource.load(async () => ['first']);
  let finish!: (page: string[]) => void;
  const pagination = resource.load(() => new Promise<string[]>((resolve) => { finish = resolve; }), (old, page) => [...(old ?? []), ...page]);
  await resource.load(async () => ['fresh']);
  finish(['obsolete']); await pagination;
  assert.deepEqual(resource.snapshot().data, ['fresh']);
});

test('Categories/detail resources hide private data and reject failures after identity or Space changes', async () => {
  for (const transition of ['identity', 'space', 'sign-out'] as const) {
    const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
    const resource = createSessionResource<string[]>(session);
    await resource.load(async () => ['private']);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const result = resource.load(async () => { await pending; throw new ExpenseApiError(401, 'UNAUTHORIZED', 'expired'); });
    if (transition === 'identity') session.observeIdentity('grace');
    else if (transition === 'space') session.changeSpace('shared');
    else session.signOut();
    finish(); await result;
    assert.equal(resource.snapshot().data, null);
    assert.equal(resource.snapshot().error, null);
    assert.equal(session.snapshot().notice, null);
  }
});
