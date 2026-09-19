import { createContext, useContext } from "react";

interface AppSessionTokenOptions {
  skipCache?: boolean;
}

interface AppSessionUser {
  readonly id: string;
  readonly fullName: string | null;
  readonly firstName: string | null;
  readonly primaryEmail: string | null;
}

interface AppSession {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly sessionId: string | null;
  readonly user: AppSessionUser | null;
  readonly getToken: (
    options?: AppSessionTokenOptions,
  ) => Promise<string | null>;
  readonly signOut: () => Promise<void>;
}

const AppSessionContext = createContext<AppSession | null>(null);

function useAppSession(): AppSession {
  const session = useContext(AppSessionContext);
  if (!session) {
    throw new Error("useAppSession must be used inside AppSessionProvider.");
  }

  return session;
}

export { AppSessionContext, useAppSession };
export type { AppSession, AppSessionTokenOptions, AppSessionUser };
