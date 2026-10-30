import { createAccountDeletionApiClient } from '../../api/account-deletion-api-client.ts';
import { ObsoleteRequestError } from '../../api/request-failure.ts';
import type { AccountBinding } from './deletion-workflow.ts';

/** Survives financial cleanup but never a change of provider identity/session. */
export function createDeletionTransport(binding: AccountBinding, credentials: {
  current(binding: AccountBinding): boolean;
  token(): Promise<string | null>;
}, baseUrl?: string) {
  const check = () => { if (!credentials.current(binding)) throw new ObsoleteRequestError(); };
  return createAccountDeletionApiClient({
    baseUrl,
    async getAccessToken() {
      check();
      const token = await credentials.token();
      check();
      return token;
    },
    async execute(operation) {
      check();
      try {
        const result = await operation();
        check();
        return result;
      } catch (error) {
        check();
        throw error;
      }
    },
  });
}
