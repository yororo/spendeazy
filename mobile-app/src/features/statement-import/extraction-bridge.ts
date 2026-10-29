import type { PageOutcome } from './import-model.ts';

/** Transient engine output. Never put these strings in the application store. */
export type ExtractedPage = PageOutcome & Readonly<{ text: string }>;
export type EngineMessage =
  | { type: 'ready'; id: string }
  | { type: 'progress'; id: string; completedPages: number; totalPages: number }
  | { type: 'password'; id: string; incorrect: boolean }
  | { type: 'error'; id: string; code: 'unreadable' | 'development-cap' }
  | { type: 'result'; id: string; extractionEngineVersion: string; pages: ExtractedPage[] };

export function decodeEngineMessage(raw: string, id: string): EngineMessage | null {
  try {
    const value = JSON.parse(raw);
    if (!value || value.id !== id) return null;
    if (value.type === 'ready') return { type: 'ready', id };
    if (value.type === 'password' && typeof value.incorrect === 'boolean') return value;
    if (value.type === 'error' && ['unreadable', 'development-cap'].includes(value.code)) return value;
    if (value.type === 'progress' && Number.isInteger(value.completedPages) && Number.isInteger(value.totalPages) &&
      value.completedPages >= 0 && value.completedPages <= value.totalPages && value.totalPages <= 100 && value.totalPages > 0) return value;
    if (value.type === 'result' && typeof value.extractionEngineVersion === 'string' && /^[A-Za-z0-9._/-]{1,100}$/u.test(value.extractionEngineVersion) && Array.isArray(value.pages) && value.pages.length > 0 && value.pages.length <= 100 &&
      value.pages.every((page: ExtractedPage, index: number) => page && page.pageIndex === index && typeof page.text === 'string' &&
        typeof page.hasImages === 'boolean' && ['text', 'blank', 'failed', 'unreadable'].includes(page.outcome) &&
        (page.outcome === 'text' || page.text === ''))) return value;
  } catch { /* Malformed bridge data is ignored, never rendered or logged. */ }
  return null;
}
