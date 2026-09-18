import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RouteLoading } from "@/components/app/route-loading";
import { AppShell } from "@/layouts/app-shell";
import { NotFoundPage } from "@/pages/not-found-page";

const SignInPage = lazy(() =>
  import("@/features/authentication").then(({ SignInPage }) => ({
    default: SignInPage,
  })),
);
const SsoCallbackPage = lazy(() =>
  import("@/features/authentication").then(({ SsoCallbackPage }) => ({
    default: SsoCallbackPage,
  })),
);
const PrivacyPolicyPage = lazy(() =>
  import("@/pages/legal-pages").then(({ PrivacyPolicyPage }) => ({
    default: PrivacyPolicyPage,
  })),
);
const TermsOfServicePage = lazy(() =>
  import("@/pages/legal-pages").then(({ TermsOfServicePage }) => ({
    default: TermsOfServicePage,
  })),
);
const CategoriesPage = lazy(() =>
  import("@/features/categories").then(({ CategoriesPage }) => ({
    default: CategoriesPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard").then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const StatementImportPage = lazy(() =>
  import("@/features/statement-import").then(({ StatementImportPage }) => ({
    default: StatementImportPage,
  })),
);
const TransactionsPage = lazy(() =>
  import("@/features/transactions").then(({ TransactionsPage }) => ({
    default: TransactionsPage,
  })),
);

function lazyRoute(page: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{page}</Suspense>;
}

function StatementImportRoute() {
  const navigate = useNavigate();

  return (
    <StatementImportPage
      onViewTransactions={() => navigate("/transactions")}
    />
  );
}

function App() {
  return (
    <Routes>
      <Route path="sign-in" element={lazyRoute(<SignInPage />)} />
      <Route path="sso-callback" element={lazyRoute(<SsoCallbackPage />)} />
      <Route path="privacy" element={lazyRoute(<PrivacyPolicyPage />)} />
      <Route path="terms" element={lazyRoute(<TermsOfServicePage />)} />
      <Route element={<AuthenticatedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={lazyRoute(<DashboardPage />)} />
          <Route
            path="imports"
            element={lazyRoute(<StatementImportRoute />)}
          />
          <Route
            path="transactions"
            element={lazyRoute(<TransactionsPage />)}
          />
          <Route path="categories" element={lazyRoute(<CategoriesPage />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
