import { useRouter, type Href } from "expo-router";

import {
  dismissRecoveryAnnouncement,
  useSessionSnapshot,
} from "@/application/session-runtime";
import { SpaceStatus } from "@/components/space-status";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { useDashboardReport } from "@/features/dashboard/use-dashboard-report";
import type { DashboardExpenseFilter } from "@/api/dashboard-report-api-client";
import { useSpaces } from "@/application/spaces/provider";

export default function DashboardScreen() {
  const router = useRouter();
  const controller = useDashboardReport();
  const session = useSessionSnapshot();
  const { active } = useSpaces();

  function openExpenses(filter: DashboardExpenseFilter) {
    if (!active?.id) return;
    router.push({
      pathname: "/dashboard-expenses",
      params: {
        sourceSpaceId: active.id,
        fromDate: filter.fromDate,
        toDate: filter.toDate,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      },
    });
  }

  return (
    <DashboardView
      controller={controller}
      spaceStatus={<SpaceStatus />}
      recoveryMessage={
        session.announceRecovery
          ? "Private work from this session is still here for the same Google account."
          : null
      }
      onDismissRecovery={dismissRecoveryAnnouncement}
      onOpenExpenses={openExpenses}
      onOpenBudgetCategory={(categoryId) => {
        if (!active?.id) return;
        router.push(
          `/category-editor?spaceId=${encodeURIComponent(active.id)}&categoryId=${encodeURIComponent(categoryId)}` as Href,
        );
      }}
      onOpenImportHistory={() => router.push("/statement-import-history")}
    />
  );
}
