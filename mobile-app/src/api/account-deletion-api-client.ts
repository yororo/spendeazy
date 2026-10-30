import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { decodeApiResponse } from './request-failure.ts';

export type DeletionStatus = 'pending' | 'completed';
const path = '/api/v1/users/me/deletion';
type Reply = { status: number; location: string | null; payload: unknown };
function status(payload: unknown): DeletionStatus {
  if (typeof payload !== 'object' || payload === null || Object.keys(payload).length !== 1 ||
      !('status' in payload) || (payload.status !== 'pending' && payload.status !== 'completed')) throw new Error('Invalid deletion status');
  return payload.status;
}

/** Uses account credentials only. Never follows a server-supplied URL. */
export function createAccountDeletionApiClient(options: AuthorizedRequestOptions) {
  return {
    async submit(): Promise<DeletionStatus> {
      const reply = await authorizedRequest<Reply>(options, '/api/v1/users/me', { method: 'DELETE', responseMetadata: true });
      return decodeApiResponse(() => {
        if (reply.status === 204) return 'completed';
        if (reply.status !== 202 || reply.location !== path || status(reply.payload) !== 'pending') throw new Error('Invalid acceptance');
        return 'pending';
      });
    },
    async check(): Promise<DeletionStatus> {
      const reply = await authorizedRequest<Reply>(options, path, { responseMetadata: true });
      return decodeApiResponse(() => {
        if (reply.status !== 200) throw new Error('Invalid status response');
        return status(reply.payload);
      });
    },
  };
}
