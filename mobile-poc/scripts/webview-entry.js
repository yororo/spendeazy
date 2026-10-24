import { WorkerMessageHandler } from "../node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.mjs";
import {
  PasswordException,
  PDFParse,
} from "../node_modules/pdf-parse/dist/pdf-parse/web/pdf-parse.es.js";

// pdf.js consults this global and runs WorkerMessageHandler on this thread.
// A classic script must set it; <script type="module"> is blocked from file://.
globalThis.pdfjsWorker = { WorkerMessageHandler };

const networkEvents = () => globalThis.__pocNetworkEvents;

function postToHost(message) {
  const json = JSON.stringify(message);
  const bridge = globalThis.ReactNativeWebView;
  if (bridge && typeof bridge.postMessage === "function") {
    bridge.postMessage(json);
  }
  globalThis.dispatchEvent(new CustomEvent("poc-parser", { detail: message }));
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function errorCode(error) {
  if (
    error instanceof PasswordException ||
    error?.name === "PasswordException"
  ) {
    return "password";
  }
  return "unreadable";
}

async function extractStatementPages({ data, password }) {
  const startedCount = networkEvents().length;
  const started = performance.now();
  let parser;
  try {
    parser = new PDFParse({
      data,
      password: password == null || password === "" ? undefined : password,
      // Partial extraction could silently omit transactions. Same flag as the web extractor.
      stopAtErrors: true,
    });
    const result = await parser.getText({ pageJoiner: "" });
    return {
      pages: result.pages.map(({ num, text }) => ({ num, text })),
      elapsedMs: performance.now() - started,
      networkRequests: networkEvents().length - startedCount,
      networkUrls: networkEvents()
        .slice(startedCount)
        .map((event) => event.url),
    };
  } catch (error) {
    const failure = new Error(
      error && error.message
        ? error.message
        : "Unable to extract text from PDF.",
    );
    failure.code = errorCode(error);
    failure.networkRequests = networkEvents().length - startedCount;
    failure.networkUrls = networkEvents()
      .slice(startedCount)
      .map((event) => event.url);
    failure.elapsedMs = performance.now() - started;
    throw failure;
  } finally {
    if (parser) await parser.destroy();
  }
}

async function handleParse(message) {
  try {
    const data = bytesFromBase64(message.dataBase64);
    const result = await extractStatementPages({
      data,
      password: message.password,
    });
    postToHost({ type: "result", id: message.id, ...result });
  } catch (error) {
    postToHost({
      type: "error",
      id: message.id,
      code: error.code || "unreadable",
      message: error.message,
      networkRequests: error.networkRequests ?? 0,
      networkUrls: error.networkUrls ?? [],
      elapsedMs: error.elapsedMs ?? 0,
    });
  }
}

function onWindowMessage(event) {
  let data = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }
  if (!data || typeof data !== "object") return;
  if (data.type === "parse") {
    void handleParse(data);
    return;
  }
  if (data.type === "probe-fetch") {
    const before = networkEvents().length;
    Promise.resolve()
      .then(() => globalThis.fetch("https://example.invalid/poc-fetch-probe"))
      .then(
        () => {
          postToHost({
            type: "probe-fetch-result",
            id: data.id,
            blocked: false,
            networkRequests: networkEvents().length - before,
          });
        },
        () => {
          postToHost({
            type: "probe-fetch-result",
            id: data.id,
            blocked: true,
            networkRequests: networkEvents().length - before,
          });
        },
      );
  }
}

globalThis.extractStatementPages = extractStatementPages;
window.addEventListener("message", onWindowMessage);
document.addEventListener("message", onWindowMessage);
postToHost({ type: "ready" });
