import { useMemo, type ReactNode } from "react";

import {
  createApiClient,
  type ApiAuthenticationFailureHandler,
  type ApiTokenProvider,
} from "./api-client";
import type { ApiConfig } from "./api-config";
import { ApiClientContext } from "./api-client-context";

interface ApiClientProviderProps {
  config: ApiConfig;
  getToken: ApiTokenProvider;
  sessionId?: string;
  onAuthenticationFailure?: ApiAuthenticationFailureHandler;
  children: ReactNode;
}

function ApiClientProvider({
  config,
  getToken,
  sessionId,
  onAuthenticationFailure,
  children,
}: ApiClientProviderProps) {
  const { baseUrl } = config;
  const apiClient = useMemo(
    () =>
      createApiClient({ baseUrl }, getToken, globalThis.fetch, {
        sessionId,
        onAuthenticationFailure,
      }),
    [baseUrl, getToken, sessionId, onAuthenticationFailure],
  );

  return (
    <ApiClientContext.Provider value={apiClient}>
      {children}
    </ApiClientContext.Provider>
  );
}

export { ApiClientProvider };
