import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  queryPolicy,
  useAuthenticatedIdentityId,
} from "@/shared/query";

import { getAccessibleSpaces } from "./space";
import { leaveSharedSpace } from "./space";
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

function useLeaveSharedSpaceMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => leaveSharedSpace(apiClient, spaceId),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["spaces", "accessible"] }),
  });
}

export { useAccessibleSpacesQuery, useLeaveSharedSpaceMutation };
