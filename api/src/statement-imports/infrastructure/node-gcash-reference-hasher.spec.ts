import { createHash } from 'node:crypto';
import { NodeGCashReferenceHasher } from './node-gcash-reference-hasher';

describe('NodeGCashReferenceHasher', () => {
  const input = {
    spaceId: '7',
    provider: ' GCash ',
    reference: '123456789',
  };

  it('produces a stable domain-separated HMAC digest', () => {
    const hasher = new NodeGCashReferenceHasher('test-key');

    const first = hasher.hash(input);
    const second = hasher.hash(input);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toBe(
      createHash('sha256').update(input.reference).digest('hex'),
    );
  });

  it('changes when the dedicated key or duplicate scope tuple changes', () => {
    const hasher = new NodeGCashReferenceHasher('test-key');
    const digest = hasher.hash(input);

    expect(new NodeGCashReferenceHasher('other-key').hash(input)).not.toBe(
      digest,
    );
    expect(hasher.hash({ ...input, spaceId: '8' })).not.toBe(digest);
    expect(hasher.hash({ ...input, provider: 'Other wallet' })).not.toBe(
      digest,
    );
    expect(hasher.hash({ ...input, reference: '987654321' })).not.toBe(digest);
  });

  it('fails closed when the dedicated key is unavailable', () => {
    expect(() => new NodeGCashReferenceHasher(undefined).hash(input)).toThrow(
      'GCASH_REFERENCE_HASH_KEY is required for GCash imports',
    );
  });
});
