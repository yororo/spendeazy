import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "./use-api-client";
import { getUserProfile, provisionUser } from "./user-profile";
import { queryPolicy, shouldRetryProvisioning } from "../query";

const API_USER_PROFILE_QUERY_KEY = ["api-user-profile"] as const;
const USER_PROVISIONING_QUERY_KEY = ["api-user-provisioning"] as const;

function useUserProvisioningQuery() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: USER_PROVISIONING_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const profile = await provisionUser(apiClient, signal);
      queryClient.setQueryData(API_USER_PROFILE_QUERY_KEY, profile);
      return profile;
    },
    retry: shouldRetryProvisioning,
    retryDelay: queryPolicy.provisioningRetryDelay,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

function useApiUserProfileQuery() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: API_USER_PROFILE_QUERY_KEY,
    queryFn: ({ signal }) => getUserProfile(apiClient, signal),
  });
}

export {
  API_USER_PROFILE_QUERY_KEY,
  USER_PROVISIONING_QUERY_KEY,
  shouldRetryProvisioning,
  useApiUserProfileQuery,
  useUserProvisioningQuery,
};
