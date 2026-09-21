import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/shared/api';

import {
  cancelInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  resendInvitation,
  retryInvitation,
} from './invitations-service';

function useInvitationsQuery() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['invitations'] as const,
    queryFn: ({ signal }) => getInvitations(apiClient, signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

function useInvitationMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    retry: 0,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });
}

function useCreateInvitationMutation() {
  const apiClient = useApiClient();
  return useInvitationMutation((email: string) =>
    createInvitation(apiClient, email),
  );
}

function useCancelInvitationMutation() {
  const apiClient = useApiClient();
  return useInvitationMutation((invitationId: string) =>
    cancelInvitation(apiClient, invitationId),
  );
}

function useResendInvitationMutation() {
  const apiClient = useApiClient();
  return useInvitationMutation((invitationId: string) =>
    resendInvitation(apiClient, invitationId),
  );
}

function useRetryInvitationMutation() {
  const apiClient = useApiClient();
  return useInvitationMutation((invitationId: string) =>
    retryInvitation(apiClient, invitationId),
  );
}

function useDeclineInvitationMutation() {
  const apiClient = useApiClient();
  return useInvitationMutation((invitationId: string) =>
    declineInvitation(apiClient, invitationId),
  );
}

export {
  useCancelInvitationMutation,
  useCreateInvitationMutation,
  useDeclineInvitationMutation,
  useInvitationsQuery,
  useResendInvitationMutation,
  useRetryInvitationMutation,
};

