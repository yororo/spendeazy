import { useContext } from "react";

import { AppSessionContext } from "@/shared/session/app-session";

interface FinancialQueryScope {
  readonly identityId: string | null;
  readonly spaceId: string | null;
}

type FinancialMutationScope = FinancialQueryScope;

const financialQueryOptions = {
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
};

function useAuthenticatedIdentityId(): string | null {
  const session = useContext(AppSessionContext);
  return session?.user?.id ?? session?.sessionId ?? null;
}

function useFinancialQueryScope(spaceId?: string): FinancialQueryScope {
  return {
    identityId: useAuthenticatedIdentityId(),
    spaceId: spaceId ?? null,
  };
}

function captureFinancialMutationScope(
  identityId: string | null,
  spaceId?: string,
): FinancialMutationScope {
  return {
    identityId,
    spaceId: spaceId ?? null,
  };
}

function buildFinancialQueryKey(
  scope: FinancialQueryScope,
  featureKey: readonly unknown[],
  ...parts: readonly unknown[]
): readonly unknown[] {
  return [...featureKey, scope.identityId, scope.spaceId, ...parts];
}

export {
  buildFinancialQueryKey,
  captureFinancialMutationScope,
  financialQueryOptions,
  useAuthenticatedIdentityId,
  useFinancialQueryScope,
};
export type { FinancialMutationScope, FinancialQueryScope };
