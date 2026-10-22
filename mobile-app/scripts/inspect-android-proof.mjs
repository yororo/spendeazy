// Manual diagnostic of the real Android WebView via a localhost ADB CDP forward.
// Default mode bypasses DocumentPicker; --observe-ui watches a real UI action.
import { readFile } from 'node:fs/promises';
import { chromium } from '../../web/node_modules/playwright/index.mjs';
import { transformStatement } from '../.expo/parser-proof-transformer.mjs';
import { reconstruct } from '../.expo/parser-proof-extraction.mjs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url() === 'about:blank');
if (!page) throw new Error('Open Parser proof and forward its WebView CDP socket first');
const protocols = [];
page.on('request', (request) => protocols.push(new URL(request.url()).protocol));
await page.evaluate(() => {
  const original = window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView);
  window.proofDiagnosticOriginal = original;
  window.proofDiagnosticResults = [];
  window.ReactNativeWebView.postMessage = (message) => {
    const value = JSON.parse(message);
    if (value.type === 'result' || value.type === 'error') window.proofDiagnosticResults.push(value);
    original(message);
  };
});
try {
  if (process.argv.includes('--observe-ui')) {
    console.log('Waiting for a result from the normal Android password/file UI.');
    await page.waitForFunction(() => window.proofDiagnosticResults.length > 0, null, { timeout: 60000 });
    const result = await page.evaluate(() => window.proofDiagnosticResults.shift());
    if (result.type === 'error') console.log(JSON.stringify({ runtime: 'android-ui', outcome: result.code }));
    else {
      const statement = transformStatement(result.pages.map((item) => reconstruct(item, false)).join('\n'));
      console.log(JSON.stringify({ runtime: 'android-ui', outcome: 'legacy-controls-reconciled', pages: result.pages.length, transactions: statement.transactions.length, extractionMs: result.elapsedMs, protocols }));
    }
  } else {
  await context.setOffline(true);
  const base64 = (await readFile(process.argv[2])).toString('base64');
  const trials = [];
  for (const [label, password] of [['missing', undefined], ['wrong', 'fictional-intentionally-wrong'], ['supplied', process.env.PROOF_PDF_PASSWORD]]) {
    await page.evaluate((message) => window.parserProofReceive(JSON.stringify(message)), { type: 'extract', id: 0, base64, password });
    await page.waitForFunction(() => window.proofDiagnosticResults.length > 0, null, { timeout: 30000 });
    const result = await page.evaluate(() => window.proofDiagnosticResults.shift());
    if (result.type === 'error') { trials.push({ label, outcome: result.code }); }
    else {
      const statement = transformStatement(result.pages.map((item) => reconstruct(item, false)).join('\n'));
      trials.push({ label, outcome: 'legacy-controls-reconciled', pages: result.pages.length, transactions: statement.transactions.length, extractionMs: result.elapsedMs, engine: result.version, webview: result.userAgent });
    }
    await page.waitForTimeout(300); // Allow asynchronous worker destruction before the next manual trial.
  }
  console.log(JSON.stringify({ runtime: 'actual-android-webview', network: 'CDP offline after app load (not airplane cold start)', input: 'debug bridge, not DocumentPicker', trials, protocols }, null, 2));
  }
} finally {
  await context.setOffline(false);
  await page.evaluate(() => { window.ReactNativeWebView.postMessage = window.proofDiagnosticOriginal; delete window.proofDiagnosticResults; delete window.proofDiagnosticOriginal; });
  await browser.close();
}
