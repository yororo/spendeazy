import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./native-profile-image.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs',
  plugins: [{ name: 'profile-native-ports', setup(builder) {
    builder.onResolve({ filter: /^expo-/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'expo-file-system'
      ? 'export const { File, Directory, Paths } = globalThis.ports;'
      : 'export const launchImageLibraryAsync = () => globalThis.ports.pick();' }));
  } }],
});
function fixture() {
  const files = new Set();
  let failDelete = false;
  let resolvePick;
  let started;
  const picked = new Promise(resolve => { resolvePick = resolve; });
  const launched = new Promise(resolve => { started = resolve; });
  class File {
    constructor(uri) { this.uri = uri; this.name = uri.split('/').at(-1); }
    get exists() { return files.has(this.uri); }
    delete() { if (failDelete) throw new Error('delete failed'); files.delete(this.uri); }
  }
  class Directory {
    constructor(...parts) { this.uri = parts.map(part => part.uri ?? part).join('/'); }
    get exists() { return [...files].some(uri => uri.startsWith(`${this.uri}/`)); }
    delete() { if (failDelete) throw new Error('delete failed'); for (const uri of files) if (uri.startsWith(`${this.uri}/`)) files.delete(uri); }
    list() { return [...files].filter(uri => !uri.slice(this.uri.length + 1).includes('/')).map(uri => new File(uri)); }
  }
  const module = { exports: {} };
  const ports = { File, Directory, Paths: { cache: new Directory('file:///cache') }, pick: () => { started(); return picked; } };
  vm.runInNewContext(bundle.outputFiles[0].text, { ports, module, exports: module.exports });
  return { api: module.exports, files, launched, resolvePick, fail(value) { failDelete = value; } };
}

test('cleanup awaits a late picker outcome, removes its copy and never returns obsolete bytes', async () => {
  const f = fixture(); let current = true;
  const selection = f.api.chooseNativeProfileImage(() => current);
  await f.launched; current = false;
  let cleared = false;
  const cleanup = f.api.cleanupProfileImages().then(() => { cleared = true; });
  await Promise.resolve(); assert.equal(cleared, false);
  const uri = 'file:///cache/ImagePicker/fictional.jpg'; f.files.add(uri);
  f.resolvePick({ canceled: false, assets: [{ uri, base64: 'fictional' }] });
  assert.equal(await selection, null); await cleanup;
  assert.equal(f.files.size, 0);
});

test('failed image removal stays retryable; startup sweeps generated cache images without touching originals', async () => {
  const f = fixture();
  const generated = 'file:///cache/00000000-0000-0000-0000-000000000000.jpg';
  const original = 'content://library/original.jpg';
  f.files.add(generated); f.files.add(original);
  f.fail(true); await assert.rejects(f.api.cleanupProfileImages());
  assert.equal(f.files.has(generated), true);
  f.fail(false); await f.api.cleanupProfileImages();
  assert.equal(f.files.has(generated), false);
  assert.equal(f.files.has(original), true);
});
