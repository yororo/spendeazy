import { createContext } from "react";

type NavigationAction = () => void;

interface NavigationGuardRegistration {
  readonly enabled: boolean;
  readonly onNavigationAttempt: (action: NavigationAction) => void;
}

interface NavigationGuardContextValue {
  readonly registerNavigationGuard: (
    registration: NavigationGuardRegistration,
  ) => () => void;
  readonly requestNavigation: (action: NavigationAction) => boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  registerNavigationGuard: () => () => undefined,
  requestNavigation: () => false,
});

export {
  NavigationGuardContext,
  type NavigationAction,
  type NavigationGuardRegistration,
};
