declare module 'js-yaml' {
  export interface DumpOptions {
    lineWidth?: number;
    noRefs?: boolean;
  }

  export function dump(value: unknown, options?: DumpOptions): string;
  export function load(value: string): unknown;
}
