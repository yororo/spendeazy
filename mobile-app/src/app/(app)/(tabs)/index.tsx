import { useCallback, useLayoutEffect, useRef } from "react";
import { useFocusEffect, useRouter, type Href } from "expo-router";

import {
  dismissRecoveryAnnouncement,
  useSessionSnapshot,
} from "@/application/session-runtime";
import { SpaceStatus } from "@/components/space-status";
import { HomeView } from "@/features/home/home-view";
import { useHomeReport } from "@/features/home/use-home-report";
import type { HomeExpenseFilter } from "@/api/home-report-api-client";
import { useSpaces } from "@/application/spaces/provider";

export default function HomeScreen() {
  const router = useRouter();
  const controller = useHomeReport();
  const session = useSessionSnapshot();
  const { active } = useSpaces();
  const refresh = useRef(controller.refresh);
  const hasFocused = useRef(false);
  useLayoutEffect(() => { refresh.current = controller.refresh; }, [controller.refresh]);
  useFocusEffect(useCallback(() => {
    if (hasFocused.current) refresh.current();
    hasFocused.current = true;
  }, []));

  function openExpenses(filter: HomeExpenseFilter) {
    if (!active?.id) return;
    router.push({
      pathname: "/home-expenses",
      params: {
        sourceSpaceId: active.id,
        fromDate: filter.fromDate,
        toDate: filter.toDate,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      },
    });
  }

  return (
    <HomeView
      key={controller.scopeKey}
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
      onImport={active?.status === "active" && active.accessLevel === "write" ? () => router.push("/import-statement") : undefined}
      onOpenImportHistory={() => {
        if (!active) return;
        router.push({ pathname: "/statement-import-history", params: { sourceSpaceId: active.id } });
      }}
    />
  );
}
