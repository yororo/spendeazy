// Manual desktop browser diagnostic. Does NOT certify either mobile platform.
import { readFile } from 'node:fs/promises';
import { chromium } from '../../web/node_modules/playwright/index.mjs';
const generated = await readFile(new URL('../src/prototypes/parser-proof/generated/html.ts', import.meta.url), 'utf8');
const html = JSON.parse(generated.slice(generated.indexOf(' = ') + 3).trim().replace(/;$/u, ''));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).protocol));
  await page.exposeFunction('proofMessage', (message) => {
    const value = JSON.parse(message);
    if (value.type === 'result') console.log(JSON.stringify({ runtime: 'desktop-edge-only', pages: value.pages.length, runs: value.pages.reduce((sum, item) => sum + item.runs.length, 0), elapsedMs: value.elapsedMs, requests }));
    else if (value.type !== 'progress') console.log(JSON.stringify({ type: value.type, code: value.code, version: value.version }));
  });
  await page.setContent(html.replace('<script>', '<script>window.ReactNativeWebView={postMessage:(data)=>{const message=JSON.parse(data);if(message.type==="result"||message.type==="error")window.proofFinished=true;window.proofMessage(data);}};</script><script>'));
  await page.waitForFunction(() => typeof window.parserProofReceive === 'function');
  const base64 = (await readFile(process.argv[2])).toString('base64');
  await page.evaluate((message) => window.parserProofReceive(JSON.stringify(message)), { type: 'extract', id: 1, base64, password: process.env.PROOF_PDF_PASSWORD });
  // The callback records only metadata, never private extracted text/password.
  await page.waitForFunction(() => globalThis.proofFinished === true, null, { timeout: 30000 });
} finally { await browser.close(); }
