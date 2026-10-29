import { decode, LocalDataFactory, LocalCMapFactory } from '../../features/statement-import/engine/local-resources';
// Runs only inside the restricted local WebView, never in Hermes or on a server.
import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
declare global { interface Window { ReactNativeWebView?: { postMessage: (message: string) => void }; parserProofReceive?: (data: string) => void } }

const send = (value: object) => window.ReactNativeWebView?.postMessage(JSON.stringify(value));
let active: ReturnType<typeof getDocument> | undefined;
let operation = 0;
const accept = async (data: string) => {
  let message;
  try { message = JSON.parse(data); } catch { return; }
  if (message.type !== 'extract' || active) return;
  const id = ++operation;
  const start = performance.now();
  try {
    active = getDocument({
      data: decode(message.base64), password: message.password || undefined, verbosity: 0,
      stopAtErrors: true, isEvalSupported: false, enableXfa: false,
      useWorkerFetch: false, useWasm: false, disableFontFace: true,
      StandardFontDataFactory: LocalDataFactory, CMapReaderFactory: LocalCMapFactory,
    });
    message.base64 = ''; message.password = '';
    const pdf = await active.promise;
    if (pdf.numPages > 100) throw new Error('proof-page-limit');
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const operators = await page.getOperatorList();
      const runs = content.items.filter((item): item is TextItem => 'str' in item).map((item) => ({
        str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, hasEOL: item.hasEOL,
      }));
      const images = operators.fnArray.filter((op) => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op)).length;
      pages.push({ pageNumber, runs, images });
      send({ type: 'progress', id: message.id, pageNumber, total: pdf.numPages });
      page.cleanup();
    }
    if (id === operation) send({ type: 'result', id: message.id, pages, elapsedMs: Math.round(performance.now() - start), version, userAgent: navigator.userAgent });
  } catch (error) {
    const exception = error as { name?: string; code?: number; message?: string };
    // Do not forward raw engine messages: they can contain document contents.
    const code = exception.name === 'PasswordException' ? (exception.code === 2 ? 'wrong-password' : 'password-required') : exception.message === 'proof-page-limit' ? 'page-limit' : 'unreadable';
    send({ type: 'error', id: message.id, code });
  } finally { await active?.destroy(); active = undefined; }
};
// Android delivers postMessage on document; iOS on window.
document.addEventListener('message', (event) => void accept((event as MessageEvent).data));
window.addEventListener('message', (event) => void accept(event.data));
window.parserProofReceive = (data) => void accept(data);
send({ type: 'ready', version });
