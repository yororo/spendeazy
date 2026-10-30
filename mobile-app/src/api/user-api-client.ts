import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { decodeApiResponse } from './request-failure.ts';
import { parseUserProfile, type UserProfile } from './user-response.ts';

export function createUserApiClient(options: AuthorizedRequestOptions) {
  return {
    async getUser(): Promise<UserProfile> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me');
      return decodeApiResponse(() => parseUserProfile(payload));
    },
    async synchronizeProfile(): Promise<UserProfile> {
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me', { method: 'PUT' });
      return decodeApiResponse(() => parseUserProfile(payload));
    },
    async provisionUser(): Promise<void> {
      // The API derives identity and profile from Clerk, without client profile input.
      const payload = await authorizedRequest<unknown>(options, '/api/v1/users/me', { method: 'PUT' });
      decodeApiResponse(() => parseUserProfile(payload));
    },
  };
}
