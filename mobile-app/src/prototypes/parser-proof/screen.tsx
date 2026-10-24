// THROWAWAY: device feasibility proof, not the production Statement Import.
import { useEffect, useRef, useState } from 'react';
import { AppState, Button, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { parserProofHtml } from './generated/html';
import { reconstruct, type ProofPage } from './extraction';
import { transformStatement, type Statement } from './providers/transformer';
import { demoRules, matchCategory } from './rules';

export default function ParserProof() {
  const webview = useRef<WebView<object>>(null);
  const operation = useRef(0);
  const ownedFile = useRef<File | null>(null);
  const bytes = useRef<string>('');
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Choose a locally available PDF. Nothing is uploaded.');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(false);
  const [pages, setPages] = useState<ProofPage[]>([]);
  const [spatial, setSpatial] = useState(false);
  const [showText, setShowText] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, string | number>>({ platform: Platform.OS, osVersion: String(Platform.Version) });
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ruleInput, setRuleInput] = useState('  fictional   journey ');
  const [heartbeat, setHeartbeat] = useState(0);

  function cleanupFile() {
    if (ownedFile.current?.exists) ownedFile.current.delete();
    ownedFile.current = null;
    bytes.current = '';
  }
  function cancel() {
    operation.current++;
    setGeneration((value) => value + 1); // Destroys WebView and worker, including a synchronous in-flight page.
    setReady(false); setBusy(false); setChallenge(false); setPassword(''); setPages([]); cleanupFile();
    setStatus('Discarded. Worker destroyed; late results ignored; app-created PDF copy deleted.');
  }
  useEffect(() => {
    const operationCounter = operation;
    const subscription = AppState.addEventListener('change', (state) => setLifecycle((events) => [...events.slice(-9), state]));
    const timer = setInterval(() => setHeartbeat((tick) => tick + 1), 1000);
    return () => { subscription.remove(); clearInterval(timer); operationCounter.current++; cleanupFile(); };
  }, []);

  function extract(secret = '') {
    setPassword(''); setChallenge(false); setBusy(true);
    setStatus('Extracting locally…');
    webview.current?.postMessage(JSON.stringify({ type: 'extract', id: operation.current, base64: bytes.current, password: secret }));
  }
  async function pick() {
    const id = ++operation.current;
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) { setBusy(false); return; }
      const file = new File(result.assets[0].uri);
      if (id !== operation.current) { if (file.exists) file.delete(); return; }
      cleanupFile(); setPages([]); setShowText(false);
      ownedFile.current = file;
      setMetrics((previous) => ({ platform: previous.platform, osVersion: previous.osVersion, bytes: file.size }));
      // Investigation guardrails only, not selected production limits.
      if (file.size > 10 * 1024 * 1024) { cleanupFile(); setBusy(false); setStatus('Proof limit: choose a PDF below 10 MiB. No upload fallback.'); return; }
      const base64 = await file.base64();
      if (id !== operation.current) return;
      bytes.current = base64;
      extract();
    } catch { cleanupFile(); setBusy(false); setStatus('Could not read the local PDF. Choose another file.'); }
  }
  const text = pages.map((page) => reconstruct(page, spatial)).join('\n');
  let statement: Statement | null = null;
  let interpretation = '';
  if (pages.length) {
    try { statement = transformStatement(text); interpretation = 'Legacy provider controls reconcile. Compare every row with the original PDF.'; }
    catch (error) {
      // Content is shown only in this local view, never logged or exported.
      interpretation = error instanceof Error ? error.message : 'Provider interpretation failed';
    }
  }
  const blankPages = pages.filter((page) => !page.runs.some((run) => run.str.trim())).length;
  const mixed = pages.some((page) => page.images > 0);
  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>On-device parser proof</Text>
      <Text>THROWAWAY • PDF.js 5.4.296 • no API connection</Text>
      <Text>Does the same local engine preserve statement text and Transactions on Android and iPhone? This experiment cannot save Expenses.</Text>
      <Text testID="proof-status" style={styles.status}>{status}</Text>
      <Text>Worker: {ready ? 'ready' : 'starting'} · UI heartbeat: {heartbeat}</Text>
      <Button title="Choose PDF from this device" disabled={!ready || busy || challenge} onPress={() => void pick()} />
      {challenge && <View>
        <Text>Enter the PDF password. Spaces are preserved.</Text>
        <TextInput testID="proof-password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Button title="Unlock locally" disabled={busy} onPress={() => extract(password)} />
      </View>}
      <Button title="Cancel / discard and clear" onPress={cancel} />
      <Text style={styles.heading}>Observed state</Text>
      <Text selectable>{JSON.stringify(metrics, null, 2)}</Text>
      <Text>Lifecycle: {lifecycle.join(' → ') || 'active'}; draft is in memory only.</Text>
      {pages.length > 0 && <>
        <Text>Pages: {pages.length}; empty-text pages: {blankPages}; image operations: {pages.reduce((sum, page) => sum + page.images, 0)}</Text>
        {blankPages > 0 && <Text style={styles.warning}>Some pages have no text. Scanned pages cannot be extracted; completeness is unresolved.</Text>}
        {mixed && <Text style={styles.warning}>Images detected (including possible logos/scans). Text extraction alone cannot establish completeness.</Text>}
        <Button title={spatial ? 'Order: spatial lines (switch to stream)' : 'Order: engine stream (switch to spatial)'} onPress={() => setSpatial((value) => !value)} />
        <Text style={styles.heading}>Provider interpretation</Text>
        <Text style={statement ? styles.status : styles.warning}>{interpretation}</Text>
        <Text>Snapshot semantics are legacy: mismatches currently throw; GCash direction is heuristic. Neither is the approved target behavior.</Text>
        {statement && <>
          <Text selectable>{JSON.stringify(statement.summary, null, 2)}</Text>
          <Text style={styles.heading}>{statement.transactions.length} Transactions — extracted values</Text>
          {statement.transactions.map((transaction, index) => <View key={index} style={styles.row}>
            <Text>{index + 1}. {transaction.transactionDate.toISOString().slice(0, 10)} · PHP {transaction.amount.toFixed(2)}</Text>
            <Text>{transaction.description}</Text>
            <Text>{transaction.reference ?? ''} · local rule: {matchCategory(transaction.description)}</Text>
          </View>)}
        </>}
        <Button title={showText ? 'Hide local text / geometry' : 'Show local text / geometry'} onPress={() => setShowText((value) => !value)} />
        {showText && pages.map((page) => <View key={page.pageNumber}><Text style={styles.heading}>Page {page.pageNumber}</Text><Text selectable>{reconstruct(page, spatial)}</Text><Text selectable>{JSON.stringify(page.runs.slice(0, 10))}</Text></View>)}
      </>}
      <Text style={styles.heading}>Offline Category Rule probe</Text>
      <Text>Exact overrides Contains; conflicting Categories stay Unmapped; inactive Categories do not match. Fictional rules only.</Text>
      <TextInput style={styles.input} value={ruleInput} onChangeText={setRuleInput} />
      <Text testID="proof-rule-result">{matchCategory(ruleInput)}</Text>
      <Text selectable>{JSON.stringify(demoRules, null, 2)}</Text>
      <Text style={styles.warning}>10 MiB / 100 pages are temporary safety caps, not validated launch limits. Native peak memory and offline cold-start evidence still require device review.</Text>
    </ScrollView>
    <WebView<object> key={generation} ref={webview} style={styles.engine} source={{ html: parserProofHtml }}
      originWhitelist={['about:*']} javaScriptEnabled domStorageEnabled={false} cacheEnabled={false} webviewDebuggingEnabled={__DEV__}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
      onContentProcessDidTerminate={cancel} onRenderProcessGone={cancel}
      onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === 'ready') { setReady(true); return; }
        if (message.id !== operation.current) return;
        if (message.type === 'progress') { setStatus(`Extracting page ${message.pageNumber} of ${message.total} locally…`); return; }
        setBusy(false); setPassword('');
        if (message.type === 'error') {
          const needsPassword = message.code === 'password-required' || message.code === 'wrong-password';
          setChallenge(needsPassword);
          setStatus(needsPassword ? (message.code === 'wrong-password' ? 'Wrong password. Try again locally.' : 'This PDF needs a password.') : 'Unreadable or proof limit reached. Retry / choose another PDF; no remote fallback.');
          if (!needsPassword) cleanupFile();
          return;
        }
        if (message.type === 'result') {
          setPages(message.pages); setMetrics((previous) => ({ ...previous, extractionMs: message.elapsedMs, engine: message.version, webview: message.userAgent }));
          cleanupFile(); setStatus('Local extraction complete. Temporary PDF copy deleted. Review text order and Transactions below.');
        }
      }} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFE' }, content: { padding: 20, gap: 14 },
  title: { fontSize: 27, fontWeight: '600', color: '#25334D' }, heading: { fontSize: 17, fontWeight: '600' },
  status: { color: '#397F7A' }, warning: { color: '#986224' },
  input: { borderWidth: 1, borderColor: '#64738B', padding: 12, borderRadius: 8, color: '#25334D' },
  row: { borderTopWidth: 1, borderColor: '#DDD', paddingVertical: 8 }, engine: { width: 1, height: 1, opacity: 0, position: 'absolute' },
});
