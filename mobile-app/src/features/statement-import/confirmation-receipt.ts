export type ImportReceipt = Readonly<{ userId: string; spaceId: string; operationId: string }>;
export const RECEIPT_KEY = 'statement-import-receipt.v1';
export type ReceiptStorage = { getItemAsync(key: string): Promise<string | null>; setItemAsync(key: string, value: string): Promise<void>; deleteItemAsync(key: string): Promise<void> };

export function parseReceipt(json: string): ImportReceipt {
  const value = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'operationId,spaceId,userId' ||
    typeof value.userId !== 'string' || !value.userId.trim() || typeof value.spaceId !== 'string' || !/^[1-9]\d*$/u.test(value.spaceId) ||
    typeof value.operationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value.operationId)) throw Error('Invalid import receipt');
  return { userId: value.userId, spaceId: value.spaceId, operationId: value.operationId };
}
const same = (a: ImportReceipt | null, b: ImportReceipt) => a?.userId === b.userId && a.spaceId === b.spaceId && a.operationId === b.operationId;

/** One application owner; failures leave admission closed until a successful retry. */
export function createReceiptOwner(storage: ReceiptStorage) {
  let tail = Promise.resolve();
  let epoch = 0;
  let receipt: ImportReceipt | null = null;
  let hydrated = false;
  let cleanupRequired = false;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.then(() => {}, () => {});
    return result;
  }
  return {
    async hydrate(userId: string) {
      const started = epoch;
      return enqueue(async () => {
        if (started !== epoch || cleanupRequired) throw Error('Receipt cleanup required');
        if (!hydrated) {
          const json = await storage.getItemAsync(RECEIPT_KEY);
          if (started !== epoch) throw Error('Obsolete receipt read');
          receipt = json === null ? null : parseReceipt(json);
          hydrated = true;
        }
        if (receipt && receipt.userId !== userId) {
          await storage.deleteItemAsync(RECEIPT_KEY);
          if (started !== epoch) throw Error('Obsolete identity');
          receipt = null;
        }
        return receipt;
      });
    },
    write(value: ImportReceipt) {
      const started = epoch;
      const clean = parseReceipt(JSON.stringify(value));
      return enqueue(async () => {
        if (started !== epoch || cleanupRequired || !hydrated) throw Error('Receipt not ready');
        if (receipt && !same(receipt, clean)) throw Error('Another import requires recovery');
        await storage.setItemAsync(RECEIPT_KEY, JSON.stringify(clean));
        if (started !== epoch) throw Error('Obsolete receipt write');
        receipt = clean;
      });
    },
    clearMatching(value: ImportReceipt) {
      const started = epoch;
      return enqueue(async () => {
        if (started !== epoch || !same(receipt, value)) return;
        await storage.deleteItemAsync(RECEIPT_KEY);
        if (started === epoch) receipt = null;
      });
    },
    cleanup() {
      const started = ++epoch;
      receipt = null; hydrated = false; cleanupRequired = true;
      return enqueue(async () => {
        await storage.deleteItemAsync(RECEIPT_KEY);
        if (started === epoch) cleanupRequired = false;
      });
    },
  };
}
export type ReceiptOwner = ReturnType<typeof createReceiptOwner>;
