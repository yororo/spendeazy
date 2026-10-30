import { useAuth, useClerk } from '@clerk/expo';
import { useLayoutEffect, useMemo, useRef } from 'react';

import type { AuthorizedRequestOptions } from '@/api/authorized-request';
import type { SessionScope } from './session';
import { session, useSessionSnapshot } from './session-runtime';
import { sessionRequest } from './session-request';
import { accountDeletion } from '@/features/account-deletion/deletion-runtime';

export function useAuthorizedClient(): AuthorizedRequestOptions & { isCurrent: () => boolean; scope: SessionScope } {
  const transport = useSessionTransport();
  const { generation, userId, spaceId } = useSessionSnapshot();
  return useMemo(() => {
    const scope = { generation, userId, spaceId };
    return {
      ...transport.forScope(scope),
      scope,
    };
  }, [transport, generation, userId, spaceId]);
}

/** Clerk adapter: compare live credentials, and terminate only the failed session. */
export function useSessionTransport() {
  const { getToken, signOut, sessionId } = useAuth();
  const clerk = useClerk();
  const callbacks = useRef({ getToken, signOut });
  // Clerk Expo recreates getToken on every render. Keep callback freshness from
  // recreating transports, workflows, and the effects that load those workflows.
  useLayoutEffect(() => {
    callbacks.current = { getToken, signOut };
  }, [getToken, signOut]);
  return useMemo(() => ({
    async prepareSignIn() {
      const activeSessionId = clerk.session?.id;
      if (activeSessionId) await callbacks.current.signOut({ sessionId: activeSessionId });
    },
    forScope(scope: SessionScope) {
      const credentialsCurrent = () => clerk.session?.id === sessionId && clerk.user?.id === scope.userId;
      return {
        getAccessToken: () => callbacks.current.getToken(),
        execute: sessionRequest(session, scope, async () => {
          const failedSession = clerk.session;
          if (!credentialsCurrent() || !failedSession) return;
          try {
            // A live provider read distinguishes temporary token expiry from revocation.
            await failedSession.reload();
            if (!credentialsCurrent()) return;
            if (failedSession.status === 'active') {
              const token = await callbacks.current.getToken({ skipCache: true });
              if (token && credentialsCurrent() && scope.userId) session.resumeVerifiedIdentity(scope.userId, sessionId ?? null);
              return;
            }
            await session.signOut();
          } catch (error) {
            if (!credentialsCurrent()) return;
            const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
            if (status === 401 || status === 404) await session.signOut();
            else return; // Outage is ambiguous: keep the recovery gate and drafts.
          }
          if (credentialsCurrent()) await callbacks.current.signOut({ sessionId: sessionId ?? undefined });
        }, credentialsCurrent, async () => {
          if (scope.userId && sessionId) await accountDeletion.signalDeleted({ userId: scope.userId, sessionId });
        }),
        isCurrent: () => session.isCurrent(scope) && credentialsCurrent(),
      };
    },
    async signOut() {
      await session.signOut();
      await callbacks.current.signOut({ sessionId: sessionId ?? undefined });
      await accountDeletion.forget();
    },
  }), [clerk, sessionId]);
}
