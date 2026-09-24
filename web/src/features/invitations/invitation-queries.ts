import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/shared/api';
import { queryPolicy } from '@/shared/query';

import {
  acceptInvitation,
  claimInvitation,
  createInvitation,
  declineInvitation,
  getInvitations,
  revokeInvitation,
  rotateInvitation,
} from './invitations-service';

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

function useClaimInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => claimInvitation(apiClient, code),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  });
}

function useRotateInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rotateInvitation(apiClient),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  });
}

function useRevokeInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => revokeInvitation(apiClient),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  });
}

function useDeclineInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) => declineInvitation(apiClient, claimId),
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
  });
}

function useAcceptInvitationMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) => acceptInvitation(apiClient, claimId),
    retry: 0,
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['spaces', 'accessible'] }),
      ]);
    },
  });
}

export {
  INVITATIONS_QUERY_KEY,
  useAcceptInvitationMutation,
  useClaimInvitationMutation,
  useCreateInvitationMutation,
  useDeclineInvitationMutation,
  useInvitationsQuery,
  useRevokeInvitationMutation,
  useRotateInvitationMutation,
};
