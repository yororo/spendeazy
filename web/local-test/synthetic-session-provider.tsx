import { useCallback, useMemo, useState, type ReactNode } from "react";

import { AppSessionProvider } from "../src/shared/session/app-session-provider";
import type { AppSession } from "../src/shared/session/app-session";
import { LocalTestPanel, LocalTestSignedOut } from "./local-test-panel";

interface SyntheticSessionProviderProps {
  token: string;
  children: ReactNode;
}

function SyntheticSessionProvider({
  token,
  children,
}: SyntheticSessionProviderProps) {
  const [isSignedIn, setIsSignedIn] = useState(true);
  const signOut = useCallback(async () => {
    setIsSignedIn(false);
  }, []);
  const resume = useCallback(() => {
    setIsSignedIn(true);
  }, []);
  const session = useMemo<AppSession>(
    () => ({
      isLoaded: true,
      isSignedIn,
      sessionId: "local-test-session",
      user: isSignedIn
        ? {
            id: "local-test-populated-user",
            fullName: "Local Test User",
            firstName: "Local",
            primaryEmail: "local-test-user@example.invalid",
          }
        : null,
      getToken: async () => (isSignedIn ? token : null),
      signOut,
    }),
    [isSignedIn, signOut, token],
  );

  return (
    <AppSessionProvider session={session}>
      {isSignedIn ? (
        <LocalTestPanel onSignOut={signOut}>{children}</LocalTestPanel>
      ) : (
        <LocalTestSignedOut onResume={resume} />
      )}
    </AppSessionProvider>
  );
}

export { SyntheticSessionProvider };
