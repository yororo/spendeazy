import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getRoutes } from 'expo-router/build/getRoutesCore.js';

test('sign-in belongs to the auth layout targeted by the root session guard', () => {
  const appDirectory = fileURLToPath(new URL('../app/', import.meta.url));
  const keys = readdirSync(appDirectory, { recursive: true })
    .filter(path => /\.[jt]sx?$/.test(path))
    .map(path => `./${path.replaceAll('\\', '/')}`);
  // Discover the real filesystem routes without loading native screen components.
  const context = () => ({ default: () => null });
  context.keys = () => keys;
  const root = getRoutes(context, {
    platform: 'android', importMode: 'lazy', ignoreEntryPoints: true,
  });
  const auth = root.children.find(route => route.route === '(auth)');
  assert.ok(auth, 'The root auth guard must target a registered layout');
  assert.ok(auth.children.some(route => route.route === 'sign-in'));
  assert.ok(root.children.some(route => route.route === '(app)'));
});
