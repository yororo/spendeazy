import { useAuth } from '@clerk/expo';
import { useMemo } from 'react';

import type { AuthorizedRequestOptions } from '@/api/authorized-request';

export function useAuthorizedClient(): AuthorizedRequestOptions {
  const { getToken } = useAuth();
  return useMemo(() => ({ getAccessToken: () => getToken() }), [getToken]);
}
