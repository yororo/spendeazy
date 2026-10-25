import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request';

export function createUserApiClient(options: AuthorizedRequestOptions) {
  return {
    async provisionUser(): Promise<void> {
      // The API derives identity and profile from Clerk, without client profile input.
      await authorizedRequest<unknown>(options, '/api/v1/users/me', { method: 'PUT' });
    },
  };
}
