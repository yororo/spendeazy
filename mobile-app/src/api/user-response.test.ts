import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUserProfile } from './user-response.ts';
import { createUserApiClient } from './user-api-client.ts';

const profile = {
  id: '7',
  name: 'Ada',
  email: 'ada@example.com',
  photoUrl: null,
  deletionStatus: 'active',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
};
test('decodes an active profile and rejects deletion states, missing fields and unsafe photos', () => {
  assert.deepEqual(parseUserProfile(profile), profile);
  for (const patch of [
    { deletionStatus: 'pending' },
    { email: null },
    { photoUrl: 'file:///private' },
    { photoUrl: undefined },
    { createdAt: 'invalid' },
  ])
    assert.throws(() => parseUserProfile({ ...profile, ...patch }));
});

test('profile reads and synchronization decode provider truth without sending identity input', async (t) => {
  const methods: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      assert.equal(init?.body, undefined);
      return Response.json(profile);
    },
  );
  const client = createUserApiClient({
    baseUrl: 'https://example.invalid',
    getAccessToken: async () => 'token',
  });
  assert.deepEqual(await client.getUser(), profile);
  assert.deepEqual(await client.synchronizeProfile(), profile);
  assert.deepEqual(methods, ['GET', 'PUT']);
});
