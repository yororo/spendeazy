import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getRoutes } from 'expo-router/build/getRoutesCore.js';
import { getNavigationConfig } from 'expo-router/build/getLinkingConfig.js';
import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath.js';
import { GuardContextProvider, useGuardRedirect } from 'expo-router/build/layouts/GuardContext.js';

const appDirectory = fileURLToPath(new URL('../app/', import.meta.url));
const context = () => ({ default: () => null });
context.keys = () => readdirSync(appDirectory, { recursive: true })
  .filter(path => /\.[jt]sx?$/.test(path)).map(path => `./${path.replaceAll('\\', '/')}`);
const routes = getRoutes(context, { platform: 'android', importMode: 'lazy', ignoreEntryPoints: true });
const config = getNavigationConfig(routes, true, { sitemap: true, notFound: true });

async function guardDestination(signedIn) {
  const require = createRequire(import.meta.url);
  const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
  let destination;
  const blockedRoute = signedIn ? '(auth)' : '(app)';
  function Capture() { destination = useGuardRedirect(blockedRoute); return null; }
  function Stack({ children }) {
    const guardedRedirects = new Map();
    React.Children.forEach(children, group => {
      if (group.type === Stack.Protected && !group.props.guard) {
        React.Children.forEach(group.props.children, screen => {
          guardedRedirects.set(screen.props.name, group.props.redirectTo);
        });
      }
    });
    // Use Expo's real guard fallback and URL parser, including generated not-found.
    return React.createElement(GuardContextProvider, { node: routes, guardedRedirects }, React.createElement(Capture));
  }
  Stack.Screen = function Screen() { return null; };
  Stack.Protected = passthrough;
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../app/_layout.tsx', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    define: { 'process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY': '"pk_test_fixture"' },
    plugins: [{ name: 'native-root-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => ({ path: args.path, external: true }));
    } }],
  });
  const compiledModule = { exports: {} };
  new Function('require', 'module', compiled.outputFiles[0].text)(name => {
    if (name === '@clerk/expo') return {
      ClerkProvider: passthrough,
      useAuth: () => ({ isLoaded: true, isSignedIn: signedIn, userId: signedIn ? 'ada' : null, sessionId: signedIn ? 'session-1' : null }),
    };
    if (name === '@clerk/expo/token-cache') return { tokenCache: {} };
    if (name === 'expo-router/stack') return { Stack };
    if (name === 'expo-splash-screen') return { preventAutoHideAsync() {}, hideAsync() {} };
    if (name === 'expo-status-bar') return { StatusBar: () => null };
    if (name === 'react-native') return { Text: passthrough, View: passthrough };
    if (name === '@/constants/theme') return {};
    if (name === '@/navigation/app-theme') return {
      AppearanceGate: passthrough,
      useAppTheme: () => ({ ready: true, scheme: 'light', palette: { canvas: '#fff' } }),
    };
    if (name === '@/application/session-runtime') return {
      observeAuthUser() {},
      useSessionSnapshot: () => ({ userId: signedIn ? 'ada' : null, authSessionId: signedIn ? 'session-1' : null, notice: null }),
    };
    return require(name);
  }, compiledModule);
  renderToStaticMarkup(React.createElement(compiledModule.exports.default));
  return getStateFromPath(destination, config);
}

function focusedNames(state) {
  const names = [];
  while (state) {
    const route = state.routes[state.index ?? state.routes.length - 1];
    names.push(route.name);
    state = route.state;
  }
  return names;
}

test('the signed-out guard redirects the Dashboard to a resolvable sign-in screen', async () => {
  assert.deepEqual(focusedNames(await guardDestination(false)), ['__root', '(auth)', 'sign-in']);
});

test('the signed-in guard redirects sign-in to the Dashboard', async () => {
  assert.deepEqual(focusedNames(await guardDestination(true)), ['__root', '(app)', '(tabs)', 'index']);
});
