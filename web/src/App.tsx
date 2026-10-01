import { lazy, Suspense, useState, type ReactNode } from "react";
import { Route, Routes, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import { capturePageScroll } from "@/shared/ui/page-scroll";
import type { InsightsReturnContext } from "@/features/insights";
import { Button } from "@/components/ui/button";

import { AuthenticatedRoute } from "@/components/app/authenticated-route";
import { RouteLoading } from "@/components/app/route-loading";
import { AppShell } from "@/layouts/app-shell";
import { getNavigationTarget } from "@/components/app/primary-navigation";
import { NotFoundPage } from "@/pages/not-found-page";

interface AppProps {
  signInElement?: ReactNode;
}

interface InsightsOrigin extends InsightsReturnContext {
  readonly path: string;
  readonly period: ReportingPeriod;
}

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
const ContextualBudgetEditor = lazy(() => import("@/features/categories").then(({ ContextualBudgetEditor }) => ({ default: ContextualBudgetEditor })));
const InsightsPage = lazy(() =>
  import("@/features/insights").then(({ InsightsPage }) => ({
    default: InsightsPage,
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
const ArchivedSpaceHistoryPage = lazy(() =>
  import("@/features/transactions").then(
    ({ ArchivedSpaceHistoryPage }) => ({
      default: ArchivedSpaceHistoryPage,
    }),
  ),
);
const SharingPage = lazy(() =>
  import("@/features/invitations").then(({ SharingPage }) => ({
    default: SharingPage,
  })),
);

function lazyRoute(page: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{page}</Suspense>;
}

function StatementImportRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceId = searchParams.get("spaceId") ?? undefined;

  return (
    <StatementImportPage
      spaceId={spaceId}
      onSpaceChange={(nextSpaceId) => {
        const nextParams = new URLSearchParams(searchParams);
        if (nextSpaceId === undefined) {
          nextParams.delete("spaceId");
        } else {
          nextParams.set("spaceId", nextSpaceId);
        }
        setSearchParams(nextParams);
      }}
      onViewTransactions={(destinationSpaceId, statementImportId) => {
        const nextParams = new URLSearchParams();
        nextParams.set("statementImportId", statementImportId);
        if (destinationSpaceId !== undefined) {
          nextParams.set("spaceId", destinationSpaceId);
        }
        const query = nextParams.toString();
        navigate(`/transactions${query ? `?${query}` : ""}`);
      }}
    />
  );
}

function CategoriesRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceId = searchParams.get("spaceId") ?? undefined;

  return (
    <CategoriesPage
      spaceId={spaceId}
      onSpaceChange={(nextSpaceId) => {
        const nextParams = new URLSearchParams(searchParams);
        if (nextSpaceId === undefined) {
          nextParams.delete("spaceId");
        } else {
          nextParams.set("spaceId", nextSpaceId);
        }
        setSearchParams(nextParams);
      }}
    />
  );
}

function InsightsRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceId = searchParams.get("spaceId") ?? undefined;
  const location = useLocation();
  const [budget, setBudget] = useState<{ categoryId: string; period: ReportingPeriod; spaceId?: string; trigger: HTMLElement | null } | null>(null);
  const returned = location.state as { insightsReturn?: InsightsReturnContext } | null;
  function closeBudget() {
    const trigger = budget?.trigger;
    setBudget(null);
    requestAnimationFrame(() => {
      const target = trigger?.isConnected ? trigger : document.getElementById("insights-recorded-spending");
      target?.focus({ preventScroll: true });
    });
  }

  return (
    <><InsightsPage
      spaceId={spaceId}
      returnContext={returned?.insightsReturn}
      onEditBudget={(categoryId, period, destinationSpaceId) => setBudget({ categoryId, period, spaceId: destinationSpaceId, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null })}
      onViewTransactions={(categoryId, period, destinationSpaceId) => {
        const params = new URLSearchParams(searchParams);
        if (categoryId === undefined) params.delete("categoryId");
        else params.set("categoryId", categoryId);
        if (destinationSpaceId) params.set("spaceId", destinationSpaceId);
        const context: InsightsOrigin = { path: `/insights${location.search}`, period, scroll: capturePageScroll(), focusId: document.activeElement?.id ?? "" };
        navigate(`/transactions?${params}`, { state: { insightsOrigin: context } });
      }}
      onManageBudgets={() => navigate(getNavigationTarget("/categories", spaceId))}
      onSpaceChange={(nextSpaceId) => {
        const nextParams = new URLSearchParams(searchParams);
        if (nextSpaceId === undefined) {
          nextParams.delete("spaceId");
        } else {
          nextParams.set("spaceId", nextSpaceId);
        }
        setSearchParams(nextParams);
      }}
    />{budget && lazyRoute(<ContextualBudgetEditor categoryId={budget.categoryId} period={budget.period} spaceId={budget.spaceId} onClose={closeBudget} />)}</>
  );
}

function DashboardRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceId = searchParams.get("spaceId") ?? undefined;

  return (
    <DashboardPage
      spaceId={spaceId}
      onManageBudgets={() => navigate(getNavigationTarget("/categories", spaceId))}
      onSpaceChange={(nextSpaceId) => {
        const nextParams = new URLSearchParams(searchParams);
        if (nextSpaceId === undefined) {
          nextParams.delete("spaceId");
        } else {
          nextParams.set("spaceId", nextSpaceId);
        }
        setSearchParams(nextParams);
      }}
    />
  );
}

function TransactionsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPeriod } = useReportingPeriod();
  const [origin] = useState(() =>
    (location.state as { insightsOrigin?: InsightsOrigin } | null)?.insightsOrigin,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceId = searchParams.get("spaceId") ?? undefined;

  return (
    <>{origin && <div className="px-4 pt-4"><Button variant="outline" onClick={() => { setPeriod(origin.period); navigate(origin.path, { state: { insightsReturn: origin } }); }}>Return to Insights</Button></div>}<TransactionsPage
      spaceId={spaceId}
      onSpaceChange={(nextSpaceId) => {
        const nextParams = new URLSearchParams(searchParams);
        if (nextSpaceId === undefined) {
          nextParams.delete("spaceId");
        } else {
          nextParams.set("spaceId", nextSpaceId);
        }
        setSearchParams(nextParams);
      }}
    /></>
  );
}

function App({ signInElement }: AppProps = {}) {
  const signInRoute = signInElement ?? lazyRoute(<SignInPage />);

  return (
    <Routes>
      <Route path="sign-in" element={signInRoute} />
      <Route path="sso-callback" element={lazyRoute(<SsoCallbackPage />)} />
      <Route path="privacy" element={lazyRoute(<PrivacyPolicyPage />)} />
      <Route path="terms" element={lazyRoute(<TermsOfServicePage />)} />
      <Route element={<AuthenticatedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={lazyRoute(<DashboardRoute />)} />
          <Route
            path="imports"
            element={lazyRoute(<StatementImportRoute />)}
          />
          <Route
            path="transactions"
            element={lazyRoute(<TransactionsRoute />)}
          />
          <Route path="categories" element={lazyRoute(<CategoriesRoute />)} />
          <Route path="insights" element={lazyRoute(<InsightsRoute />)} />
          <Route
            path="history"
            element={lazyRoute(<ArchivedSpaceHistoryPage />)}
          />
          <Route path="sharing" element={lazyRoute(<SharingPage />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
