import type { ReactNode } from "react";

import { AppSessionContext, type AppSession } from "./app-session";

interface AppSessionProviderProps {
  session: AppSession;
  children: ReactNode;
}

function AppSessionProvider({
  session,
  children,
}: AppSessionProviderProps) {
  return (
    <AppSessionContext.Provider value={session}>
      {children}
    </AppSessionContext.Provider>
  );
}

export { AppSessionProvider };
