import {
  clearPrivateSession,
  holdPrivateSession,
  reconcilePrivateSession,
  type PrivateSession,
} from './private-session.ts';

export type AuthTransition = {
  previousUserId: string | null;
  nextUserId: string | null;
  explicitSignOut: boolean;
  held: PrivateSession | null;
};

export function applyAuthTransition(input: AuthTransition): {
  held: PrivateSession | null;
  notice: 'expired' | null;
} {
  if (input.explicitSignOut) {
    return { held: clearPrivateSession(), notice: null };
  }
  if (input.previousUserId && !input.nextUserId) {
    return { held: holdPrivateSession(input.held), notice: 'expired' };
  }
  if (input.nextUserId) {
    return {
      held: reconcilePrivateSession(input.held, input.nextUserId),
      notice: null,
    };
  }
  return { held: input.held, notice: null };
}

export function shouldAnnounceRecovery(
  noticeBefore: 'expired' | null,
  heldBefore: PrivateSession | null,
  heldAfter: PrivateSession | null,
): boolean {
  return Boolean(
    noticeBefore === 'expired' &&
      heldBefore &&
      heldAfter &&
      heldBefore.ownerUserId === heldAfter.ownerUserId &&
      heldBefore.draft !== null &&
      heldAfter.draft === heldBefore.draft,
  );
}
