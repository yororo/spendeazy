import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAccessibleSpaces,
  rememberedSpaceStorageKey,
  selectActiveSpace,
  spaceIdentityLabel,
  type AccessibleSpace,
} from './active-space.ts';

const personal: AccessibleSpace = {
  id: '7',
  kind: 'personal',
  status: 'active',
  accessLevel: 'write',
  members: [{ id: '1', name: 'Ada Lovelace' }],
};

const shared: AccessibleSpace = {
  id: '8',
  kind: 'shared',
  status: 'active',
  accessLevel: 'write',
  members: [
    { id: '1', name: 'Ada Lovelace' },
    { id: '2', name: 'Grace Hopper' },
  ],
};

test('keeps a remembered Space that is still authorized', () => {
  assert.deepEqual(selectActiveSpace([personal, shared], '8'), shared);
});

test('falls back to Personal when the remembered Space is unavailable', () => {
  assert.deepEqual(selectActiveSpace([personal, shared], '99'), personal);
});

test('falls back to Personal when nothing is remembered', () => {
  assert.deepEqual(selectActiveSpace([personal, shared], null), personal);
});

test('has no active Space when Personal is missing', () => {
  assert.equal(selectActiveSpace([shared], 'missing'), null);
});

test('labels Personal and Shared Spaces explicitly', () => {
  assert.equal(spaceIdentityLabel(personal), 'Personal');
  assert.equal(
    spaceIdentityLabel(shared),
    'Shared · Ada Lovelace, Grace Hopper',
  );
  assert.equal(
    spaceIdentityLabel({ ...shared, status: 'archived' }),
    'Archived Shared · Ada Lovelace, Grace Hopper',
  );
});

test('remembers the last Space separately for each signed-in identity', () => {
  assert.equal(rememberedSpaceStorageKey('user_a'), 'active-space:user_a');
  assert.notEqual(
    rememberedSpaceStorageKey('user_a'),
    rememberedSpaceStorageKey('user_b'),
  );
});

test('reads an authorized Spaces response', () => {
  assert.deepEqual(parseAccessibleSpaces([personal, shared]), [personal, shared]);
});

test('rejects a Spaces response that is not a list of Spaces', () => {
  assert.throws(() => parseAccessibleSpaces({ id: '7' }), /Spaces response/);
});
