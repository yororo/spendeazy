import { useCallback, useRef, type ReactNode } from "react";

import {
  NavigationGuardContext,
  type NavigationGuardRegistration,
} from "./navigation-guard-context";

interface NavigationGuardProviderProps {
  readonly children: ReactNode;
}

function NavigationGuardProvider({ children }: NavigationGuardProviderProps) {
  const registrationRef = useRef<NavigationGuardRegistration | null>(null);

  const registerNavigationGuard = useCallback(
    (registration: NavigationGuardRegistration) => {
      registrationRef.current = registration;

      return () => {
        if (registrationRef.current === registration) {
          registrationRef.current = null;
        }
      };
    },
    [],
  );

  const requestNavigation = useCallback((action: () => void) => {
    const registration = registrationRef.current;
    if (!registration?.enabled) return false;

    registration.onNavigationAttempt(action);
    return true;
  }, []);

  return (
    <NavigationGuardContext.Provider
      value={{ registerNavigationGuard, requestNavigation }}
    >
      {children}
    </NavigationGuardContext.Provider>
  );
}

export { NavigationGuardProvider };
