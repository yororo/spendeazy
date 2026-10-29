import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { decodeEngineMessage } from './extraction-bridge';
import { statementImportHtml } from './generated/html';
import { importWorkflow, registerPasswordSender } from './import-runtime';

export function StatementExtractionHost() {
  const { request } = useSyncExternalStore(importWorkflow.subscribe, importWorkflow.snapshot, importWorkflow.snapshot);
  useEffect(() => { importWorkflow.initialize(); }, []);
  return request ? <Engine key={request.id} id={request.id} /> : null;
}
function Engine({ id }: { id: string }) {
  const webview = useRef<WebView<object>>(null);
  const sent = useRef(false);
  const alive = useRef(true);
  const send = useCallback((message: object) => { webview.current?.postMessage(JSON.stringify({ ...message, id })); }, [id]);
  useEffect(() => {
    alive.current = true;
    const host = webview.current;
    registerPasswordSender(password => {
      importWorkflow.passwordSent(id); send({ type: 'password', password });
    });
    const timeout = setTimeout(() => { if (!sent.current) importWorkflow.engineFailed(id); }, 30000);
    return () => { alive.current = false; clearTimeout(timeout); registerPasswordSender(null); host?.stopLoading(); };
  }, [id, send]);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
    <WebView<object> ref={webview} source={{ html: statementImportHtml }} originWhitelist={['about:*']}
      javaScriptEnabled domStorageEnabled={false} cacheEnabled={false} incognito webviewDebuggingEnabled={false}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false} mixedContentMode="never"
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onLoadEnd={() => send({ type: 'initialize' })}
      onError={() => importWorkflow.engineFailed(id)}
      onContentProcessDidTerminate={() => importWorkflow.engineFailed(id)} onRenderProcessGone={() => importWorkflow.engineFailed(id)}
      onMessage={event => {
        if (!alive.current) return;
        const message = decodeEngineMessage(event.nativeEvent.data, id);
        if (!message) return;
        if (message.type === 'ready') {
          if (sent.current) return;
          importWorkflow.receive(message);
          const base64 = importWorkflow.consumeBytes(id);
          if (base64 === null) return;
          sent.current = true; send({ type: 'extract', base64 }); return;
        }
        importWorkflow.receive(message);
      }} />
  </View>;
}
