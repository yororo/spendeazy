import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/shared/api';
import { queryPolicy } from '@/shared/query';

import { createInvitation, getInvitations } from './invitations-service';

const INVITATIONS_QUERY_KEY = ['invitations'] as const;

function useInvitationsQuery() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: ({ signal }) => getInvitations(apiClient, signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useCreateInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createInvitation(apiClient),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  });
}

export {
  INVITATIONS_QUERY_KEY,
  useCreateInvitationMutation,
  useInvitationsQuery,
};
