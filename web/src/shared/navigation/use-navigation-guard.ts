import { useContext } from "react";

import { NavigationGuardContext } from "./navigation-guard-context";

function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

export { useNavigationGuard };
