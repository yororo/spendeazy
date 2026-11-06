import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useState, type ReactElement, type Ref } from "react";
import { StyleSheet, View } from "react-native";
import RawWebView, { type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

import { parserWebViewHtml } from "./generated/parser-webview-html";
import type { ExtractedPage } from "./parse-statement";

interface ParserWebViewHandle {
  postMessage: (message: string) => void;
  injectJavaScript: (script: string) => void;
}

interface ParserWebViewProps {
  source: { uri: string };
  originWhitelist: string[];
  onShouldStartLoadWithRequest: (request: ShouldStartLoadRequest) => boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  onError: (event: { nativeEvent: { description: string } }) => void;
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  cacheEnabled: boolean;
  incognito: boolean;
  sharedCookiesEnabled: boolean;
  thirdPartyCookiesEnabled: boolean;
  allowFileAccess: boolean;
  allowingReadAccessToURL: string;
  setSupportMultipleWindows: boolean;
  javaScriptCanOpenWindowsAutomatically: boolean;
  mixedContentMode: "never";
  style: { width: number; height: number };
}

// SDK 58's WebView prop intersection collapses to `never` under TypeScript 6.
const ParserWebView = RawWebView as unknown as (
  props: ParserWebViewProps & { ref?: Ref<ParserWebViewHandle | null> },
) => ReactElement | null;

export interface WebViewExtraction {
  readonly pages: readonly ExtractedPage[];
  readonly elapsedMs: number;
  readonly networkRequests: number;
  readonly networkUrls: readonly string[];
}

export interface WebViewExtractionError extends Error {
  readonly code: string;
  readonly networkRequests: number;
  readonly networkUrls: readonly string[];
  readonly elapsedMs: number;
}

interface PendingParse {
  readonly resolve: (value: WebViewExtraction) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface ProbeResult {
  readonly blocked: boolean;
  readonly networkRequests: number;
}

function isLocalWebViewUrl(url: string): boolean {
  return (
    url.length === 0 ||
    url.startsWith("file:") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (first << 16) | (second << 8) | third;
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return output;
}

async function materializeParserHtml(): Promise<string> {
  const file = new File(Paths.cache, "parser-webview.html");
  if (file.exists) file.delete();
  file.create();
  await file.write(parserWebViewHtml);
  return file.uri;
}

export function useOnDevicePdfExtractor() {
  const webViewRef = useRef<ParserWebViewHandle>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef(new Map<string, PendingParse>());
  const probeRef = useRef(
    new Map<string, {
      readonly resolve: (value: ProbeResult) => void;
      readonly timer: ReturnType<typeof setTimeout>;
    }>(),
  );
  const sequenceRef = useRef(0);
  const blockedUrlsRef = useRef<string[]>([]);
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blockedUrls, setBlockedUrls] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    materializeParserHtml()
      .then((uri) => {
        if (!cancelled) setHtmlUri(uri);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to write the local parser page.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const noteBlocked = useCallback((url: string) => {
    blockedUrlsRef.current = [...blockedUrlsRef.current, url];
    setBlockedUrls(blockedUrlsRef.current);
    console.log(`POC_NETWORK_BLOCKED ${url}`);
  }, []);

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      if (isLocalWebViewUrl(request.url)) return true;
      noteBlocked(request.url);
      return false;
    },
    [noteBlocked],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let message: {
      type?: string;
      id?: string;
      pages?: ExtractedPage[];
      elapsedMs?: number;
      networkRequests?: number;
      networkUrls?: string[];
      code?: string;
      message?: string;
      url?: string;
      blocked?: boolean;
    };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === "ready") {
      readyRef.current = true;
      setReady(true);
      return;
    }
    if (message.type === "network" && message.url) {
      noteBlocked(message.url);
      return;
    }
    if (message.type === "probe-fetch-result" && message.id) {
      const probe = probeRef.current.get(message.id);
      if (!probe) return;
      clearTimeout(probe.timer);
      probeRef.current.delete(message.id);
      probe.resolve({
        blocked: message.blocked === true,
        networkRequests: message.networkRequests ?? 0,
      });
      return;
    }
    if (!message.id) return;
    const pending = pendingRef.current.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current.delete(message.id);
    if (message.type === "result" && message.pages) {
      pending.resolve({
        pages: message.pages,
        elapsedMs: message.elapsedMs ?? 0,
        networkRequests: message.networkRequests ?? 0,
        networkUrls: message.networkUrls ?? [],
      });
      return;
    }
    const error = new Error(message.message || "PDF extraction failed.") as WebViewExtractionError;
    Object.assign(error, {
      code: message.code || "unreadable",
      networkRequests: message.networkRequests ?? 0,
      networkUrls: message.networkUrls ?? [],
      elapsedMs: message.elapsedMs ?? 0,
    });
    pending.reject(error);
  }, [noteBlocked]);

  const extract = useCallback((bytes: Uint8Array, password?: string) => {
    if (!readyRef.current || !webViewRef.current) {
      return Promise.reject(new Error("The on-device parser is not ready."));
    }
    const id = `parse-${sequenceRef.current + 1}`;
    sequenceRef.current += 1;
    return new Promise<WebViewExtraction>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error("On-device PDF extraction timed out."));
      }, 120_000);
      pendingRef.current.set(id, { resolve, reject, timer });
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "parse",
          id,
          dataBase64: bytesToBase64(bytes),
          password: password && password.length > 0 ? password : null,
        }),
      );
    });
  }, []);

  const probeFetch = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) {
      return Promise.reject(new Error("The on-device parser is not ready."));
    }
    const id = `probe-${sequenceRef.current + 1}`;
    sequenceRef.current += 1;
    return new Promise<ProbeResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        probeRef.current.delete(id);
        reject(new Error("Network probe timed out."));
      }, 10_000);
      probeRef.current.set(id, { resolve, timer });
      webViewRef.current?.postMessage(
        JSON.stringify({ type: "probe-fetch", id }),
      );
    });
  }, []);

  const probeNavigation = useCallback(() => {
    const before = blockedUrlsRef.current.length;
    webViewRef.current?.injectJavaScript(
      "window.location.assign('https://example.invalid/poc-network-probe'); true;",
    );
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        const blocked = blockedUrlsRef.current
          .slice(before)
          .some((url) => url.includes("poc-network-probe"));
        resolve(blocked);
      }, 2000);
    });
  }, []);

  const webView =
    htmlUri == null ? null : (
      <View style={styles.hidden} pointerEvents="none" collapsable={false}>
        <ParserWebView
          ref={webViewRef}
          source={{ uri: htmlUri }}
          // '*' lets onShouldStartLoadWithRequest see remote URLs. A http/https
          // whitelist miss would hand the URL to the system browser.
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onMessage={onMessage}
          onError={(event) => {
            setLoadError(event.nativeEvent.description);
          }}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          incognito
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowFileAccess
          allowingReadAccessToURL={Paths.cache.uri}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mixedContentMode="never"
          style={styles.webView}
        />
      </View>
    );

  return {
    ready,
    loadError,
    blockedUrls,
    extract,
    probeFetch,
    probeNavigation,
    webView,
  };
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  webView: {
    width: 1,
    height: 1,
  },
});
