import type { Request } from 'express';

export const CLERK_TOKEN_VERIFIER = Symbol('CLERK_TOKEN_VERIFIER');

export interface ClerkSession {
  readonly userId: string;
  readonly sessionId: string | null;
  readonly claims: Readonly<Record<string, unknown>>;
}

export interface ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession>;
}

export interface AuthenticatedRequest extends Request {
  authenticatedSession?: ClerkSession;
  authenticatedUserId?: string;
}

export function requireAuthenticatedClerkUserId(
  request: AuthenticatedRequest,
): string {
  const clerkUserId = request.authenticatedSession?.userId;
  if (!clerkUserId) {
    throw new Error('Authenticated Clerk user context is missing');
  }

  return clerkUserId;
}

export function requireAuthenticatedUserId(
  request: AuthenticatedRequest,
): string {
  const userId = request.authenticatedUserId;
  if (!userId) {
    throw new Error('Authenticated local user context is missing');
  }

  return userId;
}

export function isClerkSession(value: unknown): value is ClerkSession {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<ClerkSession>;
  return (
    typeof session.userId === 'string' &&
    session.userId.length > 0 &&
    (session.sessionId === null || typeof session.sessionId === 'string') &&
    session.claims !== null &&
    typeof session.claims === 'object' &&
    !Array.isArray(session.claims)
  );
}
