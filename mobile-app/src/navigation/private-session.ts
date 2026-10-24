export type PrivateSession = {
  ownerUserId: string;
  draft: string | null;
  financialSelection: string | null;
};

export function holdPrivateSession(session: PrivateSession | null): PrivateSession | null {
  return session;
}

export function reconcilePrivateSession(
  session: PrivateSession | null,
  nextUserId: string,
): PrivateSession {
  if (session?.ownerUserId === nextUserId) return session;
  return { ownerUserId: nextUserId, draft: null, financialSelection: null };
}

export function clearPrivateSession(): null {
  return null;
}

export function clearFinancialSelection(session: PrivateSession): PrivateSession {
  return { ...session, financialSelection: null };
}
