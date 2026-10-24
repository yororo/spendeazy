import { authorizedRequest, type AuthorizedRequestOptions } from '@/api/authorized-request';
import { parseAccessibleSpaces, type AccessibleSpace } from '@/navigation/active-space';

export function createSpacesApiClient(options: AuthorizedRequestOptions) {
  return {
    async listSpaces(): Promise<AccessibleSpace[]> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me/spaces');
      return parseAccessibleSpaces(payload);
    },
  };
}
