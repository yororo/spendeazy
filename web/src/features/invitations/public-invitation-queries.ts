import { useMutation, useQuery } from '@tanstack/react-query';

import {
  declinePublicInvitation,
  getPublicInvitation,
} from './public-invitation-service';

function usePublicInvitationQuery(token: string) {
  return useQuery({
    queryKey: ['public-invitation', token] as const,
    queryFn: ({ signal }) => getPublicInvitation(token, signal),
    enabled: token.length > 0,
    retry: 0,
  });
}

function useDeclinePublicInvitationMutation() {
  return useMutation({
    mutationFn: ({ token, signal }: { token: string; signal?: AbortSignal }) =>
      declinePublicInvitation(token, signal),
    retry: 0,
  });
}

export { useDeclinePublicInvitationMutation, usePublicInvitationQuery };
