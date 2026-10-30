import { useCallback } from "react";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from "expo-router";
import { useStatementImportDetail } from "@/features/statement-import-history/use-statement-import-detail";
import { StatementImportDetailView } from "@/features/statement-import-history/statement-import-detail-view";

export default function StatementImportDetailScreen() {
  const route = useLocalSearchParams();
  const router = useRouter();
  const controller = useStatementImportDetail(route);
  const { refresh, cancel } = controller;
  useFocusEffect(
    useCallback(() => {
      refresh();
      return cancel;
    }, [refresh, cancel]),
  );
  return (
    <StatementImportDetailView
      controller={controller}
      onBack={() => router.back()}
      onExpenses={(mode) => {
        if (controller.active && controller.detail)
          router.push({
            pathname: "/statement-import-expenses",
            params: {
              sourceSpaceId: controller.active.id,
              statementImportId: controller.detail.id,
              mode,
            },
          } as Href);
      }}
      onExpense={(expenseId) => {
        if (controller.active)
          router.push({
            pathname: "/expense/[expenseId]",
            params: { expenseId, sourceSpaceId: controller.active.id },
          });
      }}
    />
  );
}
