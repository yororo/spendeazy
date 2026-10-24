import { ObsoleteRequestError, requestFailure } from '../api/request-failure.ts';
import type { Session, SessionScope } from './session.ts';

/** Checks both outcomes before allowing expiry to affect the current identity. */
export function sessionRequest(session: Session, scope: SessionScope, recover: () => Promise<unknown>, credentialsCurrent: () => boolean = () => true) {
  const current = () => session.isCurrent(scope) && credentialsCurrent();
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (!current()) throw new ObsoleteRequestError();
    try {
      const value = await operation();
      if (!current()) throw new ObsoleteRequestError();
      return value;
    } catch (cause) {
      if (!current()) throw new ObsoleteRequestError();
      if (requestFailure(cause) === 'expired' && session.expire(scope)) {
        // Invoke immediately, before any newer identity can be observed. Recovery
        // failure leaves the app locked on its sign-in screen, with work retained.
        void recover().catch(() => {});
      }
      throw cause;
    }
  };
}
