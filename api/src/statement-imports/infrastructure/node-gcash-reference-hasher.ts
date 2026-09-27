import { createHmac } from 'node:crypto';
import type { GCashReferenceHasher } from '../application/gcash-reference-hasher';

const GCASH_REFERENCE_HASH_DOMAIN = 'spendeazy/gcash-reference/v1';

export class NodeGCashReferenceHasher implements GCashReferenceHasher {
  constructor(private readonly secretKey: string | undefined) {}

  hash(input: {
    spaceId: string;
    provider: string;
    reference: string;
  }): string {
    if (!this.secretKey) {
      throw new Error('GCASH_REFERENCE_HASH_KEY is required for GCash imports');
    }

    const tuple = [
      GCASH_REFERENCE_HASH_DOMAIN,
      input.spaceId,
      input.provider.trim().toLocaleLowerCase(),
      input.reference.trim(),
    ];

    return createHmac('sha256', this.secretKey)
      .update(JSON.stringify(tuple), 'utf8')
      .digest('hex');
  }
}
