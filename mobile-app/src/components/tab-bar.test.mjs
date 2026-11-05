import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { build } from 'esbuild';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
let recovering = false;
const listeners = new Set();
const destinations = [];
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('./tab-bar.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'boundaries', setup(builder) {
    builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path, external: true }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)(name => {
  if (name === 'expo-router') return { useRouter: () => ({ push: path => destinations.push(path) }), usePathname: () => '/' };
  if (name === 'react-native-reanimated') return {
    __esModule: true,
    default: { View: 'AnimatedView' },
    useSharedValue: initial => ({ value: initial }),
    useAnimatedStyle: factory => factory(),
    withSpring: value => value,
  };
  if (name === 'lucide-react-native') return new Proxy({}, { get: (_, icon) => icon });
  if (name === 'react-native') return { Pressable: 'Pressable', View: 'View', useWindowDimensions: () => ({ width: 390 }) };
  if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 34 }) };
  if (name === '@/components/design-surface') return { DesignSurface: 'Surface', SelectedTabBackground: 'Selection' };
  if (name === '@/constants/theme') return { controlSize: {}, radius: {}, space: {} };
  if (name === '@/navigation/app-theme') return { useAppTheme: () => ({ palette: {} }) };
  if (name === '@/application/session-runtime') return { session: { confirmation: {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    hasReceipt: () => recovering,
  } } };
  return require(name);
}, module);

test('a retained receipt keeps browsing tabs visible and replaces Add with recovery until acknowledgment', async () => {
  const state = { index: 0, routes: ['index', 'expenses', 'budget', 'profile'].map(name => ({ name, key: name })) };
  const navigated = [];
  let tree;
  await act(async () => { tree = create(React.createElement(module.exports.SpendeazyTabBar, { state, navigateToTab: key => navigated.push(key) })); });
  const action = label => tree.root.findByProps({ accessibilityLabel: label, accessibilityRole: 'button' });
  await act(async () => action('Add').props.onPress());
  assert.equal(destinations.at(-1), '/add');
  await act(async () => { recovering = true; for (const listener of listeners) listener(); });
  assert.equal(tree.root.findAllByProps({ accessibilityRole: 'tab' }).length, 4);
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Expenses', accessibilityRole: 'tab' }).props.onPress());
  assert.deepEqual(navigated, ['expenses']);
  assert.equal(tree.root.findAllByProps({ accessibilityLabel: 'Add' }).length, 0);
  await act(async () => action('Check import status').props.onPress());
  assert.equal(destinations.at(-1), '/import-statement');
  await act(async () => { recovering = false; for (const listener of listeners) listener(); });
  assert.ok(action('Add'));
  await act(async () => tree.unmount());
});

