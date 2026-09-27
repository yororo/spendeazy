export const GCASH_REFERENCE_HASHER = Symbol('GCASH_REFERENCE_HASHER');

export interface GCashReferenceHasher {
  hash(input: { spaceId: string; provider: string; reference: string }): string;
}
