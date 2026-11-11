import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const SignInTransitionContext = createContext({
  holding: false,
  begin: () => {},
  finish: () => {},
});

/** Keeps the sign-in route visible until the authentication workflow finishes. */
export function SignInTransitionProvider({ children }: { children: ReactNode }) {
  const [holding, setHolding] = useState(false);
  const begin = useCallback(() => setHolding(true), []);
  const finish = useCallback(() => setHolding(false), []);
  const value = useMemo(() => ({ holding, begin, finish }), [holding, begin, finish]);
  return <SignInTransitionContext.Provider value={value}>{children}</SignInTransitionContext.Provider>;
}

export const useSignInTransition = () => useContext(SignInTransitionContext);
