import { useCallback, useRef, type ReactNode } from "react";

import {
  NavigationGuardContext,
  type NavigationGuardRegistration,
} from "./navigation-guard-context";

interface NavigationGuardProviderProps {
  readonly children: ReactNode;
}

function NavigationGuardProvider({ children }: NavigationGuardProviderProps) {
  const registrationsRef = useRef<NavigationGuardRegistration[]>([]);

  const registerNavigationGuard = useCallback(
    (registration: NavigationGuardRegistration) => {
      registrationsRef.current.push(registration);

      return () => {
        registrationsRef.current = registrationsRef.current.filter(
          (current) => current !== registration,
        );
      };
    },
    [],
  );

  const requestNavigation = useCallback((action: () => void) => {
    const registration = [...registrationsRef.current]
      .reverse()
      .find((current) => current.enabled);
    if (!registration) return false;

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
