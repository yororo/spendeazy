/** Only direct children of the pinned picker directory may enter the cleanup journal. */
export function isPickerCopy(uri: string, pickerDirectory: string) {
  if (!uri.startsWith(pickerDirectory.endsWith('/') ? pickerDirectory : `${pickerDirectory}/`)) return false;
  const tail = uri.slice((pickerDirectory.endsWith('/') ? pickerDirectory : `${pickerDirectory}/`).length);
  return tail.length > 0 && !/[\\/]/u.test(tail) && !/%(?:2e|2f|5c)/iu.test(tail) && tail !== '.' && tail !== '..';
}

export interface CleanupIO {
  pickerDirectory: string;
  readJournal(): string[];
  writeJournal(uris: string[]): void;
  remove(uri: string): void;
  sweepOwned(): void;
}

export function createFileOwnership(io: CleanupIO) {
  function journal() {
    const uris = io.readJournal();
    if (!Array.isArray(uris) || uris.some(uri => typeof uri !== 'string' || !isPickerCopy(uri, io.pickerDirectory))) throw new Error('cleanup-failed');
    return uris;
  }
  return {
    track(uri: string) {
      if (!isPickerCopy(uri, io.pickerDirectory)) throw new Error('prepare-failed');
      io.writeJournal([...new Set([...journal(), uri])]);
    },
    release(uri: string) {
      if (!isPickerCopy(uri, io.pickerDirectory)) throw new Error('cleanup-failed');
      io.remove(uri);
      io.writeJournal(journal().filter(value => value !== uri));
    },
    sweep() {
      for (const uri of journal()) io.remove(uri);
      io.sweepOwned();
      io.writeJournal([]);
    },
  };
}
