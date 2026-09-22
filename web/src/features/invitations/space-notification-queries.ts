import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/shared/api';
import { queryPolicy } from '@/shared/query';

import {
  getSpaceNotifications,
  markSpaceNotificationRead,
  retrySpaceNotification,
} from './space-notification';

const SPACE_NOTIFICATIONS_QUERY_KEY = ['space-notifications'] as const;

function useSpaceNotificationsQuery() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: SPACE_NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ signal }) => getSpaceNotifications(apiClient, signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useSpaceNotificationMutation(
  mutationFn: (notificationId: string) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    retry: 0,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: SPACE_NOTIFICATIONS_QUERY_KEY,
      }),
  });
}

function useRetrySpaceNotificationMutation() {
  const apiClient = useApiClient();
  return useSpaceNotificationMutation((notificationId) =>
    retrySpaceNotification(apiClient, notificationId),
  );
}

function useMarkSpaceNotificationReadMutation() {
  const apiClient = useApiClient();
  return useSpaceNotificationMutation((notificationId) =>
    markSpaceNotificationRead(apiClient, notificationId),
  );
}

export {
  SPACE_NOTIFICATIONS_QUERY_KEY,
  useMarkSpaceNotificationReadMutation,
  useRetrySpaceNotificationMutation,
  useSpaceNotificationsQuery,
};
