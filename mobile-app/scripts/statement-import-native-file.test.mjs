import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/statement-import/native-file.ts'], bundle: true, write: false, format: 'cjs', plugins: [{
  name: 'native-file-port', setup(builder) {
    builder.onResolve({ filter: /^expo-/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'expo-file-system'
      ? 'export const { File, Directory, Paths } = globalThis.ports;'
      : args.path === 'expo-crypto' ? 'export const { randomUUID, digest, CryptoDigestAlgorithm } = globalThis.ports;'
        : 'export const getDocumentAsync = () => globalThis.ports.pick();' }));
  },
}] });
function fixture() {
  const files = new Map(); const calls = [];
  let failDelete = false;
  const data = Buffer.from('%PDF-1.4 fictional bytes');
  const staging = 'file:///cache/DocumentPicker/fictional.pdf'; files.set(staging, data);
  class Directory {
    constructor(...parts) { this.uri = parts.map(part => part.uri ?? part).join('/'); }
    get exists() { return [...files.keys()].some(key => key.startsWith(`${this.uri}/`)); }
    create() {}
    delete() { calls.push('sweep-owned'); for (const key of files.keys()) if (key.startsWith(`${this.uri}/`)) files.delete(key); }
  }
  class File {
    constructor(...parts) { this.uri = parts.map(part => part.uri ?? part).join('/'); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    writeSync(value) { files.set(this.uri, Buffer.from(value)); calls.push('journal-synced'); }
    textSync() { return files.get(this.uri).toString(); }
    async copy(destination) {
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(this.exists, 'staging copy must survive until asynchronous transfer completes');
      files.set(destination.uri, Buffer.from(files.get(this.uri))); calls.push('copy-complete');
    }
    async base64() { assert.ok(this.exists); return files.get(this.uri).toString('base64'); }
    delete() { if (failDelete) throw new Error('fictional deletion failure'); calls.push(`delete:${this.uri}`); files.delete(this.uri); }
  }
  const ports = { File, Directory, Paths: { cache: 'file:///cache', document: 'file:///documents' }, randomUUID: () => 'random',
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, async digest(_algorithm, bytes) { assert.ok(bytes instanceof Uint8Array); return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer; } };
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { ports, module, exports: module.exports, atob, Uint8Array, ArrayBuffer });
  return { api: module.exports, files, calls, data, staging, failCleanup() { failDelete = true; } };
}
test('native adapter awaits copy, hashes actual bytes, and clears both scoped copies', async () => {
  const f = fixture(); f.api.sweepImportFiles(); f.api.trackPickerCopy(f.staging);
  const result = await f.api.prepareImportFile({ uri: f.staging, name: 'fictional.pdf' }, () => true);
  assert.equal(result.identity.sha256, createHash('sha256').update(f.data).digest('hex'));
  assert.equal(result.identity.byteCount, f.data.length);
  assert.equal(result.base64, f.data.toString('base64'));
  assert.ok(f.calls.indexOf('copy-complete') < f.calls.indexOf(`delete:${f.staging}`));
  assert.equal([...f.files.keys()].some(key => key.endsWith('.pdf')), false);
  assert.equal(f.files.get('file:///documents/statement-import-cleanup.json').toString(), '[]');
});
test('native adapter fences cancellation and preserves the cleanup journal on deletion failure', async () => {
  const f = fixture(); f.api.trackPickerCopy(f.staging);
  await assert.rejects(f.api.prepareImportFile({ uri: f.staging, name: 'fictional.pdf' }, () => false));
  assert.ok(f.files.has(f.staging));
  f.failCleanup(); assert.throws(() => f.api.releasePickerCopy(f.staging));
  assert.ok(f.files.get('file:///documents/statement-import-cleanup.json').toString().includes('fictional.pdf'));
});
test('cancellation while native copy is outstanding removes the owned copy without reading bytes', async () => {
  const f = fixture(); f.api.trackPickerCopy(f.staging);
  let checks = 0;
  await assert.rejects(f.api.prepareImportFile({ uri: f.staging, name: 'fictional.pdf' }, () => ++checks === 1));
  assert.equal([...f.files.keys()].some(key => key.startsWith('file:///cache/statement-import/')), false);
  assert.ok(f.files.has(f.staging));
  f.api.releasePickerCopy(f.staging);
  assert.equal(f.files.has(f.staging), false);
});
