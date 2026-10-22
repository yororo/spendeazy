// Local desktop diagnostic only. NOT WebView, Hermes, Android, or iPhone proof.
// Pass a local path and PROOF_PDF_PASSWORD; never add private input to this file.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { transformStatement } from '../.expo/parser-proof-transformer.mjs';
import { reconstruct } from '../.expo/parser-proof-extraction.mjs';

const data = new Uint8Array(await readFile(process.argv[2]));
const summary = { runtime: 'desktop-node-only', bytes: data.length, passwordTrials: [], interpretations: [] };
const start = performance.now();
for (const [label, password] of [['missing', undefined], ['wrong', 'fictional-intentionally-wrong'], ['supplied', process.env.PROOF_PDF_PASSWORD]]) {
  let task;
  try {
    task = getDocument({ data: data.slice(), password, verbosity: 0, isEvalSupported: false, stopAtErrors: true });
    const pdf = await task.promise;
    summary.passwordTrials.push({ label, outcome: 'opened' });
    if (label !== 'supplied') continue;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push({ pageNumber, images: 0, runs: text.items.filter((item) => 'str' in item).map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, hasEOL: item.hasEOL })) });
      page.cleanup();
    }
    summary.pages = pages.length;
    summary.textRuns = pages.reduce((sum, page) => sum + page.runs.length, 0);
    for (const spatial of [false, true]) {
      try {
        const statement = transformStatement(pages.map((page) => reconstruct(page, spatial)).join('\n'));
        summary.interpretations.push({ order: spatial ? 'spatial' : 'stream', outcome: 'legacy-controls-reconciled', transactions: statement.transactions.length });
      } catch (error) { summary.interpretations.push({ order: spatial ? 'spatial' : 'stream', outcome: error.code || error.name }); }
    }
    // Private data remains in Expo's ignored local output, never stdout or Git.
    await writeFile(new URL('../.expo/parser-proof-private.json', import.meta.url), JSON.stringify(pages));
  } catch (error) { summary.passwordTrials.push({ label, outcome: error.name === 'PasswordException' ? (error.code === 2 ? 'wrong-password' : 'password-required') : 'unreadable' }); }
  finally { await task?.destroy(); }
}
summary.elapsedMs = Math.round(performance.now() - start);
console.log(JSON.stringify(summary, null, 2));
