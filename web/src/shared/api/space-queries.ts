import { useQuery } from "@tanstack/react-query";

import {
  queryPolicy,
  useAuthenticatedIdentityId,
} from "@/shared/query";

import { getAccessibleSpaces } from "./space";
import { useApiClient } from "./use-api-client";

function useAccessibleSpacesQuery(enabled: boolean) {
  const apiClient = useApiClient();
  const identityId = useAuthenticatedIdentityId();

  return useQuery({
    queryKey: ["spaces", "accessible", identityId] as const,
    queryFn: ({ signal }) => getAccessibleSpaces(apiClient, signal),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

export { useAccessibleSpacesQuery };
