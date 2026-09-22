import { useAuth, useClerk, useUser } from "@clerk/react";
import { useMemo, type ReactNode } from "react";

import { type AppSession } from "./app-session";
import { AppSessionProvider } from "./app-session-provider";

interface ClerkSessionProviderProps {
  children: ReactNode;
}

function ClerkSessionProvider({ children }: ClerkSessionProviderProps) {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const session = useMemo<AppSession>(
    () => ({
      isLoaded,
      isSignedIn: isSignedIn === true,
      sessionId: sessionId ?? null,
      user: user
        ? {
            id: user.id,
            fullName: user.fullName,
            firstName: user.firstName,
            primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
          }
        : null,
      getToken,
      openUserProfile,
      signOut: () => signOut(),
    }),
    [getToken, isLoaded, isSignedIn, openUserProfile, sessionId, signOut, user],
  );

  return <AppSessionProvider session={session}>{children}</AppSessionProvider>;
}

export { ClerkSessionProvider };
