import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
declare const PROOF_ASSETS: Record<string, string>;
declare const PROOF_WORKER: string;
export const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([PROOF_WORKER], { type: 'text/javascript' }));
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('Remote extraction resource blocked');
  return nativeFetch(input, options);
};
export class LocalDataFactory {
  async fetch({ filename }: { filename: string }) {
    const key = Object.keys(PROOF_ASSETS).find((name) => name.endsWith(`/${filename}`));
    if (!key) throw new Error('Missing bundled extraction resource');
    return decode(PROOF_ASSETS[key]);
  }
}
export class LocalCMapFactory {
  async fetch({ name }: { name: string }) {
    const value = PROOF_ASSETS[`cmaps/${name}.bcmap`];
    if (!value) throw new Error('Missing bundled CMap');
    return { cMapData: decode(value), compressionType: 1 };
  }
}
