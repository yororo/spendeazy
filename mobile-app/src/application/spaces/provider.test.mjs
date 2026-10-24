import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { createSession } from '../session.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const personal = { id: '1', kind: 'personal', status: 'active', accessLevel: 'write', members: [{ id: '1', name: 'Ada' }] };

async function mountSpaces(t) {
  const session = createSession();
  session.observeIdentity('ada', 'session-1');
  const clerk = { user: { id: 'ada' }, session: { id: 'session-1' } };
  let renders = 0;
  let requests = 0;
  let tokenOverride = null;
  let value;
  let transport;
  const errors = [];
  const tokenCalls = [];
  const signOutCalls = [];
  const compiled = await build({
    stdin: {
      contents: "export { SpacesProvider, useSpaces } from './provider'; export { useSessionTransport } from '../authorized-client';",
      resolveDir: fileURLToPath(new URL('./', import.meta.url)), loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    plugins: [{ name: 'spaces-native-adapters', setup(builder) {
      for (const [filter, path] of [
        [/session-runtime$/, 'test:session'],
        [/device-memory$/, 'test:memory'],
        [/config\/api(\.ts)?$/, 'test:config'],
      ]) builder.onResolve({ filter }, () => ({ path, external: true }));
    } }],
  });
  const compiledModule = { exports: {} };
  new Function('require', 'module', compiled.outputFiles[0].text)(name => {
    if (name === 'test:session') return {
      session,
      useSessionSnapshot: () => React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot),
    };
    if (name === 'test:memory') return { readRememberedSpaceId: async () => null, writeRememberedSpaceId: async () => true };
    if (name === 'test:config') return { API_BASE_URL: 'http://spaces.test' };
    if (name === '@clerk/expo') return {
      useClerk: () => clerk,
      useAuth: () => {
        // Clerk Expo wraps getToken in a new function on each render.
        if (++renders > 30) throw new Error('Spaces exceeded the render budget');
        const credential = clerk.session.id;
        const token = tokenOverride ?? credential;
        return {
          userId: clerk.user.id, sessionId: credential,
          getToken: async () => { tokenCalls.push(token); return token; },
          signOut: async options => { signOutCalls.push(options.sessionId); },
        };
      },
    };
    return require(name);
  }, compiledModule);
  const { SpacesProvider, useSpaces, useSessionTransport } = compiledModule.exports;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(JSON.stringify([personal]));
  });
  function Consumer() {
    value = useSpaces();
    transport = useSessionTransport();
    return null;
  }
  class Boundary extends React.Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error) { errors.push(error.message); }
    render() { return this.state.error ? null : this.props.children; }
  }
  const tree = () => React.createElement(Boundary, null,
    React.createElement(SpacesProvider, null, React.createElement(Consumer)));
  let renderer;
  await act(async () => { renderer = create(tree()); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    session, clerk, tokenCalls, signOutCalls,
    get value() { return value; },
    get transport() { return transport; },
    get requests() { return requests; },
    errors,
    rotateToken: token => { tokenOverride = token; },
    rerender: async () => { await act(async () => renderer.update(tree())); },
  };
}

test('Spaces settles after one load despite new Clerk callback references on every render', async t => {
  const app = await mountSpaces(t);
  assert.deepEqual(app.errors, []);
  assert.equal(app.requests, 1);
  assert.equal(app.value.active?.id, personal.id);
  assert.equal(app.value.loading, false);
  const transport = app.transport;
  app.rotateToken('renewed-token');
  await app.rerender();
  assert.equal(app.transport, transport);
  assert.equal(app.requests, 1);
  assert.equal(await transport.forScope(app.session.capture()).getAccessToken(), 'renewed-token');
  await act(async () => { app.value.refresh(); });
  assert.equal(app.requests, 2);
  assert.equal(app.value.active?.id, personal.id);
});

test('a replacement Clerk session reloads Spaces and rejects the previous session transport', async t => {
  const app = await mountSpaces(t);
  const previous = app.transport.forScope(app.session.capture());
  const transport = app.transport;
  app.clerk.session = { id: 'session-2' };
  app.session.observeIdentity('ada', 'session-2');
  await app.rerender();
  assert.deepEqual(app.errors, []);
  assert.notEqual(app.transport, transport);
  assert.equal(app.requests, 2);
  assert.equal(app.value.active?.id, personal.id);
  const tokenCalls = app.tokenCalls.length;
  await assert.rejects(previous.execute(() => previous.getAccessToken()), { name: 'ObsoleteRequestError' });
  assert.equal(app.tokenCalls.length, tokenCalls);
  assert.deepEqual(app.signOutCalls, []);
  assert.equal(await app.transport.forScope(app.session.capture()).getAccessToken(), 'session-2');
  await app.transport.prepareSignIn();
  assert.deepEqual(app.signOutCalls, ['session-2']);
});
