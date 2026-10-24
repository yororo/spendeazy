import { File, Paths } from "expo-file-system";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { bundledFixtures, readBundledFixture } from "./src/fixtures";
import {
  formatPhpFromCents,
  interpretExtractedPages,
  type StatementParseResult,
} from "./src/parse-statement";
import { useOnDevicePdfExtractor } from "./src/pdf-webview";
import { runSelfTest, type SelfTestReport } from "./src/self-test";

interface PickedPdf {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly deletedCache: boolean;
}

function isSelfTestUrl(url: string | null): boolean {
  return url != null && url.includes("self-test");
}

export default function App() {
  const extractor = useOnDevicePdfExtractor();
  const { extract, probeFetch, probeNavigation } = extractor;
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<PickedPdf | null>(null);
  const [status, setStatus] = useState("Preparing the on-device parser.");
  const [result, setResult] = useState<StatementParseResult | null>(null);
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestReport | null>(null);
  const [busy, setBusy] = useState(false);
  const url = Linking.useURL();

  const parseBytes = useCallback(
    async (
      bytes: Uint8Array,
      statementPassword: string | undefined,
      label: string,
    ) => {
      const started = Date.now();
      try {
        const extracted = await extract(bytes, statementPassword);
        return interpretExtractedPages(
          extracted.pages,
          Date.now() - started,
          extracted.networkRequests,
          extracted.networkUrls,
        );
      } catch (error) {
        const code =
          typeof error === "object" &&
          error != null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "unreadable";
        const networkRequests =
          typeof error === "object" &&
          error != null &&
          "networkRequests" in error &&
          typeof error.networkRequests === "number"
            ? error.networkRequests
            : 0;
        const networkUrls =
          typeof error === "object" &&
          error != null &&
          "networkUrls" in error &&
          Array.isArray(error.networkUrls)
            ? error.networkUrls.filter((url): url is string => typeof url === "string")
            : [];
        return {
          provider: null,
          transactionCount: null,
          totalAmountDueCents: null,
          errorCode: code,
          errorMessage: error instanceof Error ? error.message : "Parse failed.",
          textSha256: null,
          pageCount: 0,
          elapsedMs: Date.now() - started,
          networkRequests,
          networkUrls,
          label,
        };
      }
    },
    [extract],
  );

  const showParse = useCallback((next: StatementParseResult, note: string | null) => {
    setResult(next);
    setCacheNote(note);
    setStatus(next.errorCode ? `Finished with ${next.errorCode}.` : "Parsed on device.");
  }, []);

  const runBundled = useCallback(
    async (fileName: string) => {
      const fixture = bundledFixtures.find((entry) => entry.fileName === fileName);
      if (!fixture) return;
      setBusy(true);
      setStatus(`Parsing ${fixture.fileName} on device…`);
      try {
        const bytes = await readBundledFixture(fixture);
        const next = await parseBytes(
          bytes,
          fixture.password ?? undefined,
          fixture.fileName,
        );
        showParse(next, "picker cache deleted: n/a (bundled)");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Bundled parse failed.");
      } finally {
        setBusy(false);
      }
    },
    [parseBytes, showParse],
  );

  const runAutomatedSelfTest = useCallback(async () => {
    setBusy(true);
    setStatus("Running the bundled self-test…");
    try {
      const report = await runSelfTest(parseBytes, {
        probeFetch,
        probeNavigation,
      });
      setSelfTest(report);
      setStatus(report.ok ? "Self-test passed." : "Self-test failed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Self-test failed.");
    } finally {
      setBusy(false);
    }
  }, [parseBytes, probeFetch, probeNavigation]);

  const lastSelfTestUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!extractor.ready || !isSelfTestUrl(url) || url == null) return;
    if (lastSelfTestUrl.current === url) return;
    lastSelfTestUrl.current = url;
    void runAutomatedSelfTest();
  }, [extractor.ready, runAutomatedSelfTest, url]);

  const pickPdf = useCallback(async () => {
    const pickedResult = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (pickedResult.canceled) return;
    const asset = pickedResult.assets[0];
    const file = new File(asset.uri);
    const bytes = await file.bytes();
    let deletedCache = false;
    const cacheUri = Paths.cache.uri;
    if (asset.uri.startsWith(cacheUri)) {
      try {
        file.delete();
        deletedCache = !file.exists;
      } catch (error) {
        setStatus(
          error instanceof Error
            ? `Read the PDF, but could not delete the cache copy: ${error.message}`
            : "Read the PDF, but could not delete the cache copy.",
        );
      }
    }
    setPicked({ name: asset.name, bytes, deletedCache });
    setCacheNote(
      deletedCache
        ? "picker cache deleted: yes"
        : "picker cache deleted: no (URI was not in the cache)",
    );
    setStatus(`Selected ${asset.name}.`);
  }, []);

  const parsePicked = useCallback(async () => {
    if (!picked) return;
    setBusy(true);
    setStatus(`Parsing ${picked.name} on device…`);
    try {
      const next = await parseBytes(
        picked.bytes,
        password.length > 0 ? password : undefined,
        picked.name,
      );
      showParse(
        next,
        picked.deletedCache
          ? "picker cache deleted: yes"
          : "picker cache deleted: no (URI was not in the cache)",
      );
    } finally {
      setBusy(false);
    }
  }, [parseBytes, password, picked, showParse]);

  const controlsEnabled = extractor.ready && !busy;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      {extractor.webView}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Statement Import proof of concept</Text>
        <Text style={styles.title}>On-device PDF parse</Text>
        <Text style={styles.body}>
          The hidden WebView loads one bundled classic script from a local file.
          No account, no API, and no categorization.
        </Text>
        <Text style={styles.status}>
          {extractor.loadError ?? (extractor.ready ? status : "Loading local parser…")}
        </Text>

        <Pressable
          accessibilityLabel="Pick a PDF"
          disabled={!controlsEnabled}
          onPress={() => void pickPdf()}
          style={[styles.button, !controlsEnabled && styles.disabled]}
        >
          <Text style={styles.buttonText}>Pick a PDF</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="PDF password"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setPassword}
          placeholder="Password (optional)"
          placeholderTextColor="#667085"
          style={styles.input}
          value={password}
        />
        <Pressable
          accessibilityLabel="Parse selected PDF"
          disabled={!controlsEnabled || picked == null}
          onPress={() => void parsePicked()}
          style={[
            styles.button,
            (!controlsEnabled || picked == null) && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {picked ? `Parse ${picked.name}` : "Parse selected PDF"}
          </Text>
        </Pressable>

        {bundledFixtures.map((fixture) => (
          <Pressable
            accessibilityLabel={`Test ${fixture.fileName}`}
            disabled={!controlsEnabled}
            key={fixture.fileName}
            onPress={() => void runBundled(fixture.fileName)}
            style={[styles.secondary, !controlsEnabled && styles.disabled]}
          >
            <Text style={styles.secondaryText}>Test {fixture.fileName}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel="Run self-test"
          disabled={!controlsEnabled}
          onPress={() => void runAutomatedSelfTest()}
          style={[styles.button, !controlsEnabled && styles.disabled]}
        >
          <Text style={styles.buttonText}>Run self-test</Text>
        </Pressable>

        {result ? (
          <View style={styles.panel}>
            <ResultRow label="Provider" value={result.provider ?? "—"} />
            <ResultRow
              label="Transactions"
              value={
                result.transactionCount == null
                  ? "—"
                  : String(result.transactionCount)
              }
            />
            <ResultRow
              label="Total"
              value={
                result.totalAmountDueCents == null
                  ? "—"
                  : formatPhpFromCents(result.totalAmountDueCents)
              }
            />
            <ResultRow label="Parse error code" value={result.errorCode ?? "none"} />
            <ResultRow label="Text SHA-256" value={result.textSha256 ?? "—"} />
            <ResultRow label="Elapsed" value={`${result.elapsedMs} ms`} />
            <Text style={styles.network}>
              network requests: {result.networkRequests}
            </Text>
            {cacheNote ? <Text style={styles.note}>{cacheNote}</Text> : null}
            {result.errorMessage && result.errorCode ? (
              <Text style={styles.note}>{result.errorMessage}</Text>
            ) : null}
          </View>
        ) : null}

        {selfTest ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>
              Self-test {selfTest.ok ? "passed" : "failed"}
            </Text>
            {selfTest.cases.map((entry) => (
              <Text key={entry.name} style={styles.note}>
                {entry.ok ? "PASS" : "FAIL"} {entry.name}: {entry.detail}
              </Text>
            ))}
            <Text style={styles.network}>
              network requests: {selfTest.networkRequests}
            </Text>
          </View>
        ) : null}

        {extractor.blockedUrls.length > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Blocked non-local requests</Text>
            {extractor.blockedUrls.map((blockedUrl, index) => (
              <Text key={`${blockedUrl}-${index}`} style={styles.note}>
                {blockedUrl}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f6f7f4",
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  kicker: {
    color: "#3d5a40",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    color: "#1b1f17",
    fontSize: 32,
    fontWeight: "700",
  },
  body: {
    color: "#3e463c",
    fontSize: 16,
    lineHeight: 22,
  },
  status: {
    color: "#1b1f17",
    fontSize: 15,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#1f6b45",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  secondary: {
    backgroundColor: "#e4efe6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryText: {
    color: "#1f6b45",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#c9d2c8",
    borderRadius: 12,
    borderWidth: 1,
    color: "#1b1f17",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    gap: 8,
    padding: 16,
  },
  panelTitle: {
    color: "#1b1f17",
    fontSize: 18,
    fontWeight: "700",
  },
  row: {
    gap: 2,
  },
  label: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  value: {
    color: "#1b1f17",
    fontSize: 15,
  },
  network: {
    color: "#1f6b45",
    fontSize: 16,
    fontWeight: "700",
  },
  note: {
    color: "#3e463c",
    fontSize: 14,
  },
});
