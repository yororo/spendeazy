import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';

export async function loadNativeView(entryUrl, exportName) {
  // A native host substitute, not a browser target. Render real feature/primitives
  // with supplied state, recording native props to exercise accessible user intents.
  const hosts = [];
  function host(name) {
    return function NativeTestHost(props) {
      hosts.push({ name, ...props });
      if (name === 'Modal' && !props.visible) return null;
      if (name === 'FlatList') return React.createElement(React.Fragment, null,
        props.refreshControl, props.ListHeaderComponent,
        props.data.length ? props.data.map(item => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item }))) : props.ListEmptyComponent,
        props.ListFooterComponent);
      return React.createElement(React.Fragment, null, props.children);
    };
  }
  const native = Object.fromEntries(['FlatList', 'KeyboardAvoidingView', 'Pressable', 'RefreshControl', 'Text', 'View', 'Modal', 'TextInput', 'ScrollView'].map(name => [name, host(name)]));
  const compiled = await build({
    entryPoints: [fileURLToPath(entryUrl)],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    packages: 'external',
    plugins: [{ name: 'native-test-context', setup(builder) {
      builder.onResolve({ filter: /app-theme$/ }, () => ({ path: 'theme', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import {palette, fontFamily} from '@/constants/theme'; export const useAppTheme = () => ({palette: palette.light, fonts: fontFamily});`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }));
    } }],
  });
  const require = createRequire(import.meta.url);
  const compiledModule = { exports: {} };
  new Function('require', 'module', compiled.outputFiles[0].text)(name => {
    if (name === 'react-native') return native;
    if (name === 'expo-glass-effect') return { GlassView: native.View };
    if (name === 'lucide-react-native') return new Proxy({}, {
      get: (_target, iconName) => function IconTest(props) {
        return React.createElement('icon-test', { ...props, name: String(iconName) });
      },
    });
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    return require(name);
  }, compiledModule);
  return { hosts, View: compiledModule.exports[exportName] };
}
