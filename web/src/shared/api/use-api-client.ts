import { useContext } from "react";

import { ApiClientContext } from "./api-client-context";

function useApiClient() {
  const apiClient = useContext(ApiClientContext);
  if (!apiClient) {
    throw new Error("useApiClient must be used inside ApiClientProvider.");
  }

  return apiClient;
}

export { useApiClient };
