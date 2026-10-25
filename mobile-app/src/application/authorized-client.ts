import { useAuth, useClerk } from '@clerk/expo';
import { useLayoutEffect, useMemo, useRef } from 'react';

import type { AuthorizedRequestOptions } from '@/api/authorized-request';
import type { SessionScope } from './session';
import { session, useSessionSnapshot } from './session-runtime';
import { sessionRequest } from './session-request';

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
        execute: sessionRequest(session, scope, () => callbacks.current.signOut({ sessionId: sessionId ?? undefined }), credentialsCurrent),
        isCurrent: () => session.isCurrent(scope) && credentialsCurrent(),
      };
    },
    signOut() {
      session.signOut();
      // The sign-in screen retries termination if Clerk cannot end this session.
      void callbacks.current.signOut({ sessionId: sessionId ?? undefined }).catch(() => {});
    },
  }), [clerk, sessionId]);
}
