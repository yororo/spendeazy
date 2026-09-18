import { useAuth, useClerk } from "@clerk/react";
import { useCallback } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { AuthLoading } from "@/components/app/auth-loading";
import { AuthenticatedQueryProvider } from "@/components/app/authenticated-query-provider";
import { FeatureDataError } from "@/components/app/feature-data-state";
import { readApiConfig, type ApiConfig } from "@/shared/api";
import { ReportingPeriodProvider } from "@/shared/reporting-period";

function AuthenticatedRoute() {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  const { signOut } = useClerk();
  const location = useLocation();
  const navigate = useNavigate();

  const handleAuthenticationFailure = useCallback(async () => {
    const intendedLocation = location;

    try {
      await signOut();
    } finally {
      navigate("/sign-in", {
        replace: true,
        state: {
          from: {
            pathname: intendedLocation.pathname,
            search: intendedLocation.search,
            hash: intendedLocation.hash,
          },
        },
      });
    }
  }, [location, navigate, signOut]);

  if (!isLoaded) return <AuthLoading />;

  if (!isSignedIn || !sessionId) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  let apiConfig: ApiConfig;
  try {
    apiConfig = readApiConfig();
  } catch (error) {
    return (
      <FeatureDataError
        message={
          error instanceof Error
            ? error.message
            : "The API configuration is invalid. Check your local environment and try again."
        }
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <AuthenticatedQueryProvider
      apiConfig={apiConfig}
      getToken={getToken}
      sessionId={sessionId}
      onAuthenticationFailure={handleAuthenticationFailure}
      key={sessionId}
    >
      <ReportingPeriodProvider>
        <Outlet />
      </ReportingPeriodProvider>
    </AuthenticatedQueryProvider>
  );
}

export { AuthenticatedRoute };
