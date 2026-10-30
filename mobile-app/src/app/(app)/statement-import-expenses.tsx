import { useCallback, useMemo } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSpaces } from "@/application/spaces/provider";
import { SecondaryButton } from "@/components/buttons";
import { Screen, SupportingText } from "@/components/screen";
import { ExpenseBrowse } from "@/features/expenses/browse-view";
import { useExpenseBrowse } from "@/features/expenses/use-expense-browse";
import { importRouteScope } from "@/features/statement-import-history/detail-workflow";

export default function StatementImportExpensesScreen() {
  const route = useLocalSearchParams();
  const router = useRouter();
  const { active } = useSpaces();
  const scope = importRouteScope(route, active?.id ?? null);
  const valid =
    !!scope && (route.mode === "active" || route.mode === "deleted");
  const fixedScope = useMemo(
    () => ({
      sourceSpaceId: valid ? String(route.sourceSpaceId) : "",
      statementImportId: valid ? String(route.statementImportId) : "",
    }),
    [valid, route.sourceSpaceId, route.statementImportId],
  );
  const controller = useExpenseBrowse({
    deletedOnly: route.mode === "deleted",
    fixedScope,
  });
  const { refresh } = controller;
  useFocusEffect(
    useCallback(() => {
      if (valid) refresh();
    }, [valid, refresh]),
  );
  if (!valid)
    return (
      <Screen title="Import Expenses">
        <SupportingText>
          This import is unavailable in the current Space.
        </SupportingText>
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  return (
    <ExpenseBrowse
      controller={controller}
      scopeLabel={`Statement Import ${scope.statementImportId}${active?.status === "archived" ? " · Read-only" : ""}`}
      spaceStatus={
        <SecondaryButton
          label="Back to Statement Import"
          onPress={() => router.back()}
        />
      }
      onOpenExpense={(expenseId) =>
        router.push({
          pathname: "/expense/[expenseId]",
          params: { expenseId, sourceSpaceId: scope.sourceSpaceId },
        })
      }
    />
  );
}
