import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AccountPreparationError } from "@/components/app/account-preparation-error";
import { AuthLoading } from "@/shared/ui/auth-loading";
import {
  ApiClientProvider,
  type ApiAuthenticationFailureHandler,
  type ApiConfig,
  type ApiTokenProvider,
  useUserProvisioningQuery,
} from "@/shared/api";
import { queryPolicy, shouldRetryRead } from "@/shared/query";

interface AuthenticatedQueryProviderProps {
  apiConfig: ApiConfig;
  getToken: ApiTokenProvider;
  sessionId?: string;
  onAuthenticationFailure?: ApiAuthenticationFailureHandler;
  onSignOut?: ApiAuthenticationFailureHandler;
  children: ReactNode;
}

function AuthenticatedQueryProvider({
  sessionId,
  ...props
}: AuthenticatedQueryProviderProps) {
  return (
    <SessionAuthenticatedQueryProvider
      {...props}
      sessionId={sessionId}
      key={sessionId}
    />
  );
}

function SessionAuthenticatedQueryProvider({
  apiConfig,
  getToken,
  sessionId,
  onAuthenticationFailure,
  onSignOut,
  children,
}: AuthenticatedQueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: queryPolicy.garbageCollectionTime,
            retry: shouldRetryRead,
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(
    () => () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient],
  );

  return (
    <ApiClientProvider
      config={apiConfig}
      getToken={getToken}
      sessionId={sessionId}
      onAuthenticationFailure={onAuthenticationFailure}
    >
      <QueryClientProvider client={queryClient}>
        <AccountPreparationGate onSignOut={onSignOut}>
          {children}
        </AccountPreparationGate>
      </QueryClientProvider>
    </ApiClientProvider>
  );
}

interface AccountPreparationGateProps {
  onSignOut?: ApiAuthenticationFailureHandler;
  children: ReactNode;
}

function AccountPreparationGate({
  onSignOut,
  children,
}: AccountPreparationGateProps) {
  const provisioningQuery = useUserProvisioningQuery();

  if (provisioningQuery.isPending) {
    return <AuthLoading message="Preparing your account" />;
  }

  if (provisioningQuery.isError && !provisioningQuery.data) {
    return (
      <AccountPreparationError
        message={
          provisioningQuery.error instanceof Error
            ? provisioningQuery.error.message
            : "Your account could not be prepared. Try again."
        }
        isRetrying={provisioningQuery.isFetching}
        onRetry={() => void provisioningQuery.refetch()}
        onSignOut={() => void onSignOut?.()}
      />
    );
  }

  return children;
}

export { AuthenticatedQueryProvider };
