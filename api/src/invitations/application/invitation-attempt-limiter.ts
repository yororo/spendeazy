import { Injectable } from '@nestjs/common';

export const INVITATION_ATTEMPT_LIMITER = Symbol('INVITATION_ATTEMPT_LIMITER');

export const INVITATION_ATTEMPT_LIMIT = 10;
export const INVITATION_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export interface InvitationAttemptLimiter {
  consume(userId: string, networkSource: string, now: Date): boolean;
}

@Injectable()
export class InMemoryInvitationAttemptLimiter implements InvitationAttemptLimiter {
  private readonly attemptsByUser = new Map<string, number[]>();
  private readonly attemptsByNetwork = new Map<string, number[]>();

  consume(userId: string, networkSource: string, now: Date): boolean {
    const timestamp = now.getTime();
    const userAttempts = activeAttempts(
      this.attemptsByUser.get(userId),
      timestamp,
    );
    const networkAttempts = activeAttempts(
      this.attemptsByNetwork.get(networkSource),
      timestamp,
    );

    if (
      userAttempts.length >= INVITATION_ATTEMPT_LIMIT ||
      networkAttempts.length >= INVITATION_ATTEMPT_LIMIT
    ) {
      this.attemptsByUser.set(userId, userAttempts);
      this.attemptsByNetwork.set(networkSource, networkAttempts);
      return false;
    }

    userAttempts.push(timestamp);
    networkAttempts.push(timestamp);
    this.attemptsByUser.set(userId, userAttempts);
    this.attemptsByNetwork.set(networkSource, networkAttempts);
    return true;
  }
}

function activeAttempts(
  attempts: readonly number[] | undefined,
  now: number,
): number[] {
  const cutoff = now - INVITATION_ATTEMPT_WINDOW_MS;
  return (attempts ?? []).filter((attempt) => attempt > cutoff);
}
