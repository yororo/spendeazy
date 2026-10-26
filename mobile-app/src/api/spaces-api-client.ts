import { authorizedRequest, type AuthorizedRequestOptions } from '@/api/authorized-request';
import { parseAccessibleSpaces, type AccessibleSpace } from '@/application/spaces/active-space';
import { decodeApiResponse } from './request-failure';

export function createSpacesApiClient(options: AuthorizedRequestOptions) {
  return {
    async listSpaces(): Promise<AccessibleSpace[]> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/spaces');
      return decodeApiResponse(() => parseAccessibleSpaces(payload));
    },
    async leaveSharedSpace(spaceId: string): Promise<void> {
      await authorizedRequest<void>(options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/leave`,
        { method: 'POST', body: { confirm: true } });
    },
  };
}
