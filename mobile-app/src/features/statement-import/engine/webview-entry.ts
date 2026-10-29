// Bundled local engine. No native imports or production diagnostic output.
import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { decode, LocalDataFactory, LocalCMapFactory } from './local-resources';
import type { ExtractedPage } from '../extraction-bridge';

declare global { interface Window { ReactNativeWebView?: { postMessage: (message: string) => void } } }

let task: ReturnType<typeof getDocument> | undefined;
let id: string | undefined;
let passwordReply: ((password: string) => void) | undefined;
const send = (value: object) => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
const receive = async (raw: string) => {
  let message;
  try { message = JSON.parse(raw); } catch { return; }
  if (typeof message?.id !== 'string') return;
  if (message.type === 'initialize' && !id) { id = message.id; send({ type: 'ready', id }); return; }
  if (message.id !== id) return;
  if (message.type === 'password' && typeof message.password === 'string' && passwordReply) {
    const reply = passwordReply; passwordReply = undefined;
    reply(message.password); message.password = ''; return;
  }
  if (message.type !== 'extract' || typeof message.base64 !== 'string' || task) return;
  try {
    task = getDocument({ data: decode(message.base64), verbosity: 0, stopAtErrors: true,
      isEvalSupported: false, enableXfa: false, useWorkerFetch: false, useWasm: false, disableFontFace: true,
      StandardFontDataFactory: LocalDataFactory, CMapReaderFactory: LocalCMapFactory });
    message.base64 = '';
    task.onPassword = (reply: (password: string) => void, reason: number) => { passwordReply = reply; send({ type: 'password', id, incorrect: reason === 2 }); };
    const pdf = await task.promise;
    if (pdf.numPages > 100) { send({ type: 'error', id, code: 'development-cap' }); return; }
    const pages: ExtractedPage[] = [];
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
      let page;
      let text = '';
      let hasImages = false;
      try {
        page = await pdf.getPage(pageIndex + 1);
        const content = await page.getTextContent();
        // Preserve engine stream order, including its line-end hints. No spatial sorting.
        text = content.items.filter((item): item is TextItem => 'str' in item)
          .map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
        const operators = await page.getOperatorList();
        hasImages = operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op));
        pages.push({ pageIndex, text, hasImages, outcome: text.trim() ? 'text' : hasImages ? 'unreadable' : 'blank' });
      } catch {
        // Usable text may survive an operator-list failure; conservatively mark the page failed.
        pages.push({ pageIndex, text: '', hasImages, outcome: 'failed' });
      } finally { page?.cleanup(); }
      send({ type: 'progress', id, completedPages: pageIndex + 1, totalPages: pdf.numPages });
    }
    send({ type: 'result', id, extractionEngineVersion: version, pages });
  } catch { send({ type: 'error', id, code: 'unreadable' }); }
  finally {
    message.base64 = ''; passwordReply = undefined;
    await task?.destroy(); task = undefined;
  }
};
document.addEventListener('message', event => void receive((event as MessageEvent).data));
window.addEventListener('message', event => void receive(event.data));
