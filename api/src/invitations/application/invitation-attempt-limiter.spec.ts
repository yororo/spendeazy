import {
  InMemoryInvitationAttemptLimiter,
  INVITATION_ATTEMPT_LIMIT,
  INVITATION_ATTEMPT_WINDOW_MS,
} from './invitation-attempt-limiter';

describe('InMemoryInvitationAttemptLimiter', () => {
  const now = new Date('2026-09-23T00:00:00.000Z');

  it('limits repeated attempts for one User', () => {
    const limiter = new InMemoryInvitationAttemptLimiter();

    for (let attempt = 0; attempt < INVITATION_ATTEMPT_LIMIT; attempt += 1) {
      expect(limiter.consume('42', `network-${attempt}`, now)).toBe(true);
    }

    expect(limiter.consume('42', 'another-network', now)).toBe(false);
  });

  it('limits repeated attempts from one network source', () => {
    const limiter = new InMemoryInvitationAttemptLimiter();

    for (let attempt = 0; attempt < INVITATION_ATTEMPT_LIMIT; attempt += 1) {
      expect(limiter.consume(`user-${attempt}`, '127.0.0.1', now)).toBe(true);
    }

    expect(limiter.consume('another-user', '127.0.0.1', now)).toBe(false);
  });

  it('allows a bucket to recover after the rolling window', () => {
    const limiter = new InMemoryInvitationAttemptLimiter();

    for (let attempt = 0; attempt < INVITATION_ATTEMPT_LIMIT; attempt += 1) {
      limiter.consume('42', '127.0.0.1', now);
    }

    expect(
      limiter.consume(
        '42',
        '127.0.0.1',
        new Date(now.getTime() + INVITATION_ATTEMPT_WINDOW_MS + 1),
      ),
    ).toBe(true);
  });
});
