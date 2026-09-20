import { useQuery } from "@tanstack/react-query";

import { queryPolicy } from "@/shared/query";

import { getAccessibleSpaces } from "./space";
import { useApiClient } from "./use-api-client";

function useAccessibleSpacesQuery(enabled: boolean) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["spaces", "accessible"] as const,
    queryFn: ({ signal }) => getAccessibleSpaces(apiClient, signal),
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

export { useAccessibleSpacesQuery };
