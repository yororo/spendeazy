import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileWorkflow, profileNameError } from './profile-workflow.ts';
import { selectProfileImage } from './profile-image.ts';
import { createClerkProfileAdapter } from './clerk-profile-adapter.ts';

function fixture() {
  const calls: string[] = [];
  let photoFails = false,
    nameFails = false,
    syncFails = false,
    current = true;
  const workflow = createProfileWorkflow(
    { firstName: 'Ada', lastName: 'Lovelace' },
    {
      current: () => current,
      choosePhoto: async () => 'data:image/jpeg;base64,fictional',
      updateName: async () => {
        calls.push('name');
        if (nameFails) throw new Error();
      },
      updatePhoto: async () => {
        calls.push('photo');
        if (photoFails) throw new Error();
      },
      synchronize: async () => {
        calls.push('sync');
        if (syncFails) throw new Error();
      },
    },
  );
  return {
    workflow,
    calls,
    photoFailure: (v: boolean) => {
      photoFails = v;
    },
    nameFailure: (v: boolean) => {
      nameFails = v;
    },
    syncFailure: (v: boolean) => {
      syncFails = v;
    },
    obsolete: () => {
      current = false;
    },
  };
}

test('partial provider success synchronizes and retries only the failed photo', async () => {
  const f = fixture();
  f.workflow.change({ firstName: 'Augusta' });
  await f.workflow.choosePhoto();
  f.photoFailure(true);
  await f.workflow.save();
  assert.equal(f.workflow.snapshot().phase, 'ready');
  assert.match(f.workflow.snapshot().error!, /photo/);
  assert.ok(f.workflow.snapshot().photo);
  f.photoFailure(false);
  await f.workflow.save();
  assert.deepEqual(f.calls, ['name', 'photo', 'sync', 'photo', 'sync']);
  assert.equal(f.workflow.snapshot().phase, 'saved');
  assert.equal(f.workflow.snapshot().photo, null);
});

test('API failure exposes synchronization-only retry without replaying provider mutations', async () => {
  const f = fixture();
  f.workflow.change({ firstName: 'Augusta' });
  await f.workflow.choosePhoto();
  f.syncFailure(true);
  await f.workflow.save();
  assert.equal(f.workflow.snapshot().phase, 'sync-needed');
  f.syncFailure(false);
  await f.workflow.save();
  assert.deepEqual(f.calls, ['name', 'photo', 'sync', 'sync']);
  assert.equal(f.workflow.snapshot().phase, 'saved');
});

test('provider rejection preserves name edits and does not claim saved', async () => {
  const f = fixture();
  f.workflow.change({ firstName: 'Augusta' });
  f.nameFailure(true);
  await f.workflow.save();
  assert.equal(f.workflow.snapshot().phase, 'ready');
  assert.equal(f.workflow.snapshot().firstName, 'Augusta');
  assert.match(f.workflow.snapshot().error!, /name/);
});

test('delayed provider completion after disposal cannot upload the photo or synchronize', async () => {
  let release!: () => void;
  const calls: string[] = [];
  const w = createProfileWorkflow(
    { firstName: 'Ada', lastName: '' },
    {
      current: () => true,
      choosePhoto: async () => 'fictional',
      updateName: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      updatePhoto: async () => {
        calls.push('photo');
      },
      synchronize: async () => {
        calls.push('sync');
      },
    },
  );
  w.change({ firstName: 'Augusta' });
  await w.choosePhoto();
  const saving = w.save();
  w.dispose();
  release();
  await saving;
  assert.deepEqual(calls, []);
  assert.equal(w.snapshot().photo, null);
});

test('name validation requires first name and limits the composed trimmed name', () => {
  assert.ok(profileNameError({ firstName: ' ', lastName: 'Ada' }));
  assert.ok(profileNameError({ firstName: 'A'.repeat(200), lastName: 'B' }));
  assert.equal(profileNameError({ firstName: ' Ada ', lastName: '' }), null);
});

test('photo selection returns native JPEG data and releases cache on cancellation, invalid data and obsolete completion', async () => {
  for (const mode of ['selected', 'canceled', 'obsolete', 'invalid'] as const) {
    const released: string[] = [];
    const selection = selectProfileImage(
      async () => ({
        canceled: mode === 'canceled',
        assets: [
          {
            uri: 'cache/photo.jpg',
            base64: mode === 'invalid' ? null : 'fictional',
          },
        ],
      }),
      async (uri) => {
        released.push(uri);
      },
      () => mode !== 'obsolete',
    );
    if (mode === 'invalid') await assert.rejects(selection);
    else
      assert.equal(
        await selection,
        mode === 'selected' ? 'data:image/jpeg;base64,fictional' : null,
      );
    assert.deepEqual(released, ['cache/photo.jpg']);
  }
});

test('picker permission/rejection propagates without manufacturing a selection', async () => {
  await assert.rejects(
    selectProfileImage(
      async () => {
        throw new Error('denied');
      },
      async () => {},
      () => true,
    ),
    /denied/,
  );
});

test('Clerk adapter uses the string upload contract and fences a changed session', async () => {
  const calls: unknown[] = [];
  let current = true;
  const adapter = createClerkProfileAdapter(
    {
      update: async (names) => {
        calls.push(names);
      },
      setProfileImage: async (image) => {
        calls.push(image);
        current = false;
      },
      reload: async () => {},
    },
    () => current,
  );
  await assert.rejects(
    adapter.updatePhoto('data:image/jpeg;base64,fictional'),
    /older session/,
  );
  await assert.rejects(adapter.updateName({ firstName: 'Ada', lastName: '' }));
  assert.deepEqual(calls, [{ file: 'data:image/jpeg;base64,fictional' }]);
});
