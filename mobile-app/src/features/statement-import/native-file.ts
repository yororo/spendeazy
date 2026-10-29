import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { createFileOwnership } from './file-ownership';
import type { ImportFile } from './import-model';

const owned = new Directory(Paths.cache, 'statement-import');
// Persistent journal contains random staging URIs only, never source names or PDF contents.
const journal = new File(Paths.document, 'statement-import-cleanup.json');
const ownership = createFileOwnership({
  pickerDirectory: new Directory(Paths.cache, 'DocumentPicker').uri,
  readJournal: () => journal.exists ? JSON.parse(journal.textSync()) as string[] : [],
  writeJournal: uris => journal.writeSync(JSON.stringify(uris)),
  remove: uri => { const file = new File(uri); if (file.exists) file.delete(); },
  sweepOwned: () => { if (owned.exists) owned.delete(); },
});

export const sweepImportFiles = () => ownership.sweep();
export const pickImportFile = () => DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: false, copyToCacheDirectory: true });

/** Called even for late picker outcomes, before checking session/operation ownership. */
export function trackPickerCopy(uri: string) { ownership.track(uri); }
export function releasePickerCopy(uri: string) { ownership.release(uri); }

export async function prepareImportFile(asset: DocumentPicker.DocumentPickerAsset, current: () => boolean) {
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  let base64 = '';
  const file = new File(owned, `${Crypto.randomUUID()}.pdf`);
  try {
    if (!current()) throw new Error('cancelled');
    owned.create({ intermediates: true, idempotent: true });
    const staging = new File(asset.uri);
    // Development safety cap, pending #138; checked before reading into memory.
    if (staging.size <= 0 || staging.size > 10 * 1024 * 1024) throw new Error('prepare-failed');
    await staging.copy(file);
    if (!current()) throw new Error('cancelled');
    ownership.release(asset.uri);
    base64 = await file.base64();
    if (!current()) throw new Error('cancelled');
    bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    if (!current()) throw new Error('cancelled');
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('prepare-failed');
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    if (!current()) throw new Error('cancelled');
    const identity: ImportFile = { name: asset.name, byteCount: bytes.length,
      sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
    // WebView transfer only. The source copy is removed before interpretation can publish.
    if (!current()) throw new Error('cancelled');
    return { identity, base64 };
  } finally {
    base64 = '';
    bytes?.fill(0); bytes = undefined;
    if (file.exists) file.delete();
  }
}
