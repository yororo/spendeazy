// Sanitized engine fixtures. Bundle the production entry with a deterministic PDF.js port.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

test('generated production HTML preserves bundled script syntax and local-only CSP', async () => {
  const module = await readFile('src/features/statement-import/generated/html.ts', 'utf8');
  const html = JSON.parse(module.match(/export const statementImportHtml = (.*);/u)[1]);
  const script = html.match(/<script>([\s\S]*)<\/script>/u)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('PDF.js and bundled resource notices:'));
  assert.equal(html.includes('https://cdn.'), false);
});

const bundle = await build({ entryPoints: ['src/features/statement-import/engine/webview-entry.ts'], bundle: true, write: false, format: 'iife', plugins: [{
  name: 'fictional-engine', setup(builder) {
    builder.onResolve({ filter: /pdfjs-dist|local-resources/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.includes('local-resources')
      ? 'export const decode = value => new Uint8Array([1]); export class LocalDataFactory {} export class LocalCMapFactory {}'
      : 'export const version = "fictional-engine/1"; export const getDocument = options => globalThis.fixtureTask(options); export const OPS = {paintImageXObject:1,paintInlineImageXObject:2,paintImageMaskXObject:3};' }));
  },
}] });
function engine(task) {
  const messages = [];
  let receive;
  const context = { window: { ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) }, addEventListener() {} },
    document: { addEventListener(_type, listener) { receive = listener; } }, fixtureTask: () => task };
  vm.runInNewContext(bundle.outputFiles[0].text, context);
  return { messages, send(value) { receive({ data: JSON.stringify(value) }); } };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
test('page failure preserves prior and later pages in engine order, with no raw error output', async () => {
  let destroyed = 0; let cleaned = 0;
  const task = { promise: Promise.resolve({ numPages: 3, async getPage(number) {
    if (number === 2) throw new Error('private engine contents');
    return { async getTextContent() { return { items: [{ str: `Fictional page ${number}`, hasEOL: true }, { str: 'stream order', hasEOL: false }] }; },
      async getOperatorList() { return { fnArray: [1] }; }, cleanup() { cleaned++; } };
  } }), async destroy() { destroyed++; } };
  const host = engine(task); host.send({ type: 'initialize', id: 'one' }); host.send({ type: 'extract', id: 'one', base64: 'fictional' });
  await turn();
  assert.deepEqual(host.messages.find(message => message.type === 'result').pages.map(page => page.outcome), ['text', 'failed', 'text']);
  assert.equal(host.messages.find(message => message.type === 'result').extractionEngineVersion, 'fictional-engine/1');
  assert.equal(host.messages.find(message => message.type === 'result').pages[0].text, 'Fictional page 1\nstream order ');
  assert.equal(JSON.stringify(host.messages).includes('private engine contents'), false);
  assert.equal(destroyed, 1); assert.equal(cleaned, 2);
});
test('password challenge rejects wrong generation and supports missing/wrong/correct password callbacks', async () => {
  let resolvePdf; let destroyed = 0;
  const task = { promise: new Promise(resolve => { resolvePdf = resolve; }), async destroy() { destroyed++; } };
  const host = engine(task); host.send({ type: 'initialize', id: 'one' }); host.send({ type: 'extract', id: 'one', base64: 'fictional' });
  const reply = password => {
    if (password !== 'fictional-password') { task.onPassword(reply, 2); return; }
    resolvePdf({ numPages: 1, async getPage() { return { async getTextContent() { return { items: [] }; }, async getOperatorList() { return { fnArray: [] }; }, cleanup() {} }; } });
  };
  task.onPassword(reply, 1);
  host.send({ type: 'password', id: 'stale', password: 'fictional-password' });
  assert.equal(host.messages.at(-1).type, 'password');
  host.send({ type: 'password', id: 'one', password: 'wrong' });
  assert.equal(host.messages.at(-1).incorrect, true);
  host.send({ type: 'password', id: 'one', password: 'fictional-password' }); await turn();
  assert.equal(host.messages.at(-1).pages[0].outcome, 'blank'); assert.equal(destroyed, 1);
});
test('corrupt/encrypted engine failure and development page guard expose safe codes', async () => {
  for (const fixture of ['corrupt', 'cap']) {
    let rejectPdf;
    const task = { promise: fixture === 'cap' ? Promise.resolve({ numPages: 101 }) : new Promise((_resolve, reject) => { rejectPdf = reject; }), async destroy() {} };
    const host = engine(task); host.send({ type: 'initialize', id: 'one' }); host.send({ type: 'extract', id: 'one', base64: 'fictional' });
    rejectPdf?.(new Error('private engine exception')); await turn();
    assert.equal(host.messages.at(-1).code, fixture === 'cap' ? 'development-cap' : 'unreadable');
  }
});
